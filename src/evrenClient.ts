import { EvrenConfig, EvrenModelInfo, KNOWN_MODELS } from './types';
import { apiError, EvrenApiError } from './apiErrors';

interface RemoteModel {
  id: string;
  task?: string;
  context_length?: number | null;
  default_max_output_tokens?: number | null;
  capabilities?: {
    tools?: boolean;
    vision?: boolean;
    thinking?: boolean;
    reasoning_effort?: boolean;
    reasoning_effort_values?: string[] | null;
  } | null;
}

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {

      const response = await fetch(`${this.config.serverUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await apiError(response);
      }

      const body = (await response.json()) as { data?: RemoteModel[] };
      if (!Array.isArray(body.data)) { return Object.values(KNOWN_MODELS); }
      return body.data.filter(remote =>
        typeof remote.id === 'string' && remote.id.length > 0 &&
        (remote.task ? ['chat', 'vision_chat'].includes(remote.task)
          : Boolean(KNOWN_MODELS[remote.id]) || !/ocr|embedding|rerank|asr|tts|speech|transcri/i.test(remote.id))
      ).map(remote => {
        const known = KNOWN_MODELS[remote.id];
        const caps = remote.capabilities;
        const contextWindow = remote.context_length && remote.context_length > 1
          ? remote.context_length : known?.contextWindow ?? 131072;
        const output = remote.default_max_output_tokens && remote.default_max_output_tokens > 0
          ? remote.default_max_output_tokens : known?.maxOutputTokens ?? this.config.maxOutputTokens;
        return {
          id: remote.id,
          name: known?.name ?? remote.id,
          family: known?.family ?? 'evren',
          contextWindow,
          maxOutputTokens: Math.min(output, contextWindow - 1),
          toolCalling: caps ? caps.tools === true : known?.toolCalling ?? false,
          vision: caps ? caps.vision === true : known?.vision ?? false,
          thinking: caps ? caps.thinking === true : known?.thinking ?? false,
          // Explicit service capabilities override the prototype catalog.
          supportsReasoningEffort: caps
            ? caps.reasoning_effort === true
              ? caps.reasoning_effort_values == null ? ['low', 'medium', 'high']
                : Array.isArray(caps.reasoning_effort_values) ? caps.reasoning_effort_values : []
              : []
            : known?.supportsReasoningEffort ?? [],
        };
      });
    } catch (error) {
      if (error instanceof EvrenApiError) { throw error; }
      return Object.values(KNOWN_MODELS);
    } finally {
      clearTimeout(timeoutId);
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

    if (this.config.enableThinking) {
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
        throw await apiError(response);
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
