import { EvrenConfig, EvrenModelInfo, KNOWN_MODELS } from './types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | any[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface StreamCallbacks {
  onContent: (text: string) => void;
  onToolCall: (id: string, name: string, input: any) => void;
  onThinking?: (text: string) => void;
}

export class EvrenClient {
  constructor(private readonly config: EvrenConfig) {}

  public async getAvailableModels(): Promise<EvrenModelInfo[]> {
    if (!this.config.apiKey) {
      // If no API key configured yet, return default known models
      return Object.values(KNOWN_MODELS);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.config.serverUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return Object.values(KNOWN_MODELS);
      }

      const body = (await response.json()) as { data?: Array<{ id: string }> };
      const remoteIds = new Set((body.data || []).map((m) => m.id));

      // Filter to relevant chat models
      const results: EvrenModelInfo[] = [];

      // Add known models that are either confirmed or standard
      for (const [id, model] of Object.entries(KNOWN_MODELS)) {
        if (remoteIds.size === 0 || remoteIds.has(id)) {
          results.push(model);
        }
      }

      // If remote has other models ending in -pro, -flash, or chat-like that aren't in known
      for (const id of remoteIds) {
        if (!KNOWN_MODELS[id] && !id.includes('ocr') && !id.includes('embedding') && !id.includes('reranker') && !id.includes('asr')) {
          results.push({
            id,
            name: id,
            family: 'evren',
            contextWindow: 131072,
            maxOutputTokens: this.config.maxOutputTokens,
            toolCalling: true,
            vision: false,
            thinking: false,
          });
        }
      }

      return results.length > 0 ? results : Object.values(KNOWN_MODELS);
    } catch {
      return Object.values(KNOWN_MODELS);
    }
  }

  public async streamChat(
    modelId: string,
    messages: ChatMessage[],
    tools: any[] | undefined,
    callbacks: StreamCallbacks,
    abortSignal?: AbortSignal,
    requireTool = false
  ): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('Evren API key not configured. Please run command "Evren: Set API Key".');
    }

    const modelInfo = KNOWN_MODELS[modelId];
    const isThinkingCapable = modelInfo ? modelInfo.thinking : true;

    const payload: any = {
      model: modelId,
      messages,
      stream: true,
      max_tokens: modelInfo ? Math.min(modelInfo.maxOutputTokens, this.config.maxOutputTokens) : this.config.maxOutputTokens,
    };

    if (tools && tools.length > 0 && this.config.enableToolCalling) {
      payload.tools = tools;
      if (requireTool) { payload.tool_choice = 'required'; }
    }

    if (isThinkingCapable && this.config.enableThinking) {
      payload.reasoning_effort = this.config.reasoningEffort;
    }

    if (requireTool && (!payload.tools || payload.tools.length === 0)) {
      throw new Error('This request requires tool calling. Enable Evren tool calling and provide tools.');
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timeout = setTimeout(cancel, this.config.requestTimeout);
    abortSignal?.addEventListener('abort', cancel, { once: true });
    if (abortSignal?.aborted) { cancel(); }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

    const consume = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) { return false; }
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') { return true; }
      if (!data) { return false; }
      let parsed: any;
      try { parsed = JSON.parse(data); } catch { throw new Error('The API returned an invalid streaming event.'); }
      if (parsed.error) { throw new Error('The Evren API returned a streaming error.'); }
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) { return false; }
      if (delta.content) { callbacks.onContent(delta.content); }
      for (const part of delta.tool_calls || []) {
        const index = part.index ?? 0;
        const call = toolCalls.get(index) || { id: '', name: '', arguments: '' };
        if (part.id) { call.id = part.id; }
        if (part.function?.name) { call.name += part.function.name; }
        if (part.function?.arguments) { call.arguments += part.function.arguments; }
        toolCalls.set(index, call);
      }
      return false;
    };

    try {
      const response = await fetch(`${this.config.serverUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        // Raw upstream error bodies can contain private input or credentials.
        throw new Error(`Evren API request failed (HTTP ${response.status}). Check your key, model access, and service status.`);
      }
      if (!response.body) { throw new Error('No response body returned from Evren API.'); }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      while (!completed) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (consume(line)) { completed = true; break; }
        }
        if (done) {
          if (!completed && buffer.trim()) { consume(buffer); }
          break;
        }
      }
      if (controller.signal.aborted) { throw new Error('Request cancelled or timed out.'); }
      // Validate every call before reporting any of them to the chat host.
      const validated = [...toolCalls.values()].map(call => {
        if (!call.id || !call.name) { throw new Error('The API returned an incomplete tool call.'); }
        let input: unknown;
        try { input = JSON.parse(call.arguments || '{}'); } catch { throw new Error('The API returned invalid tool arguments.'); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          throw new Error('The API returned invalid tool arguments.');
        }
        return { ...call, input };
      });
      for (const call of validated) { callbacks.onToolCall(call.id, call.name, call.input); }
    } catch (error) {
      if (controller.signal.aborted) { throw new Error('Request cancelled or timed out.'); }
      throw error;
    } finally {
      clearTimeout(timeout);
      abortSignal?.removeEventListener('abort', cancel);
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
    }
  }
}
