import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { EvrenClient, ChatMessage } from './evrenClient';
import { EvrenModelInfo, KNOWN_MODELS } from './types';

export class EvrenLanguageModelProvider implements vscode.LanguageModelChatProvider, vscode.Disposable {
  private readonly _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
  public readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

  private models: EvrenModelInfo[] = Object.values(KNOWN_MODELS);
  private outputChannel: vscode.OutputChannel;

  constructor(
    private readonly configManager: ConfigManager,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
  }

  public async refreshModels(): Promise<void> {
    this.outputChannel.appendLine('[Evren] Refreshing model list...');
    try {
      const config = await this.configManager.getConfig();
      const client = new EvrenClient(config);
      this.models = await client.getAvailableModels();
      this.outputChannel.appendLine(`[Evren] Loaded ${this.models.length} models: ${this.models.map((m) => m.id).join(', ')}`);
      this._onDidChangeLanguageModelChatInformation.fire();
    } catch (err: any) {
      this.outputChannel.appendLine(`[Evren] Error refreshing models: ${err.message}`);
    }
  }

  public provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken
  ): vscode.LanguageModelChatInformation[] {
    return this.models.map((m) => ({
      id: m.id,
      name: m.name,
      family: m.family || 'evren',
      version: '1.0.0',
      maxInputTokens: m.contextWindow - m.maxOutputTokens,
      maxOutputTokens: m.maxOutputTokens,
      detail: 'Unofficial integration by Fehmi Çitiloğlu',
      capabilities: {
        toolCalling: m.toolCalling,
        imageInput: false,
      },
    }));
  }

  public async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const config = await this.configManager.getConfig();
    if (!config.apiKey) {
      const setKeyAction = 'Set API Key';
      const selected = await vscode.window.showErrorMessage(
        'Evren API Key is not configured. Please set your API key to use Evren models.',
        setKeyAction
      );
      if (selected === setKeyAction) {
        await vscode.commands.executeCommand('evren.setApiKey');
      }
      throw new Error('Evren API Key missing.');
    }

    const client = new EvrenClient(config);
    const formattedMessages = this.convertMessages(messages);
    const formattedTools = this.convertTools(options.tools);

    this.outputChannel.appendLine(`[Evren] Chat request: model=${model.id}, messages=${formattedMessages.length}, tools=${formattedTools?.length ?? 0}`);

    const abortController = new AbortController();
    if (token.isCancellationRequested) { throw new vscode.CancellationError(); }
    const cancellation = token.onCancellationRequested(() => {
      this.outputChannel.appendLine(`[Evren] Chat request cancelled by user.`);
      abortController.abort();
    });

    try {
      await client.streamChat(
        model.id,
        formattedMessages,
        formattedTools,
        {
          onContent: (chunk: string) => {
            progress.report(new vscode.LanguageModelTextPart(chunk));
          },
          onToolCall: (id: string, name: string, input: any) => {
            this.outputChannel.appendLine(`[Evren] Tool call generated: ${name} (${id})`);
            progress.report(new vscode.LanguageModelToolCallPart(id, name, input));
          },
        },
        abortController.signal,
        options.toolMode === vscode.LanguageModelChatToolMode.Required
      );
    } catch (err: any) {
      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      this.outputChannel.appendLine(`[Evren] Chat request failed: ${err.message}`);
      throw err;
    } finally {
      cancellation.dispose();
    }
  }

  public async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    token: vscode.CancellationToken
  ): Promise<number> {
    if (token.isCancellationRequested) { throw new vscode.CancellationError(); }
    // Conservative UTF-8 byte estimate, not a model-specific tokenizer.
    const serialized = typeof text === 'string' ? text : JSON.stringify(text);
    return Buffer.byteLength(serialized, 'utf8');
  }

  private convertMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];

    for (const msg of messages) {
      const roleStr = msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant';
      let textContent = '';
      const toolCalls: any[] = [];
      const toolResults: ChatMessage[] = [];

      for (const part of msg.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          textContent += part.value;
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push({
            id: part.callId,
            type: 'function',
            function: {
              name: part.name,
              arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input),
            },
          });
        } else if (part instanceof vscode.LanguageModelToolResultPart) {
          let contentStr = '';
          for (const item of part.content) {
            if (item instanceof vscode.LanguageModelTextPart) {
              contentStr += item.value;
            } else {
              contentStr += JSON.stringify(item);
            }
          }
          toolResults.push({
            role: 'tool',
            tool_call_id: part.callId,
            content: contentStr,
          });
        } else {
          throw new Error('This version supports text and tool messages only. Remove image or unsupported attachments.');
        }
      }

      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          result.push(tr);
        }
      } else {
        const chatMsg: ChatMessage = {
          role: roleStr,
          content: textContent,
        };
        if (toolCalls.length > 0) {
          chatMsg.tool_calls = toolCalls;
        }
        result.push(chatMsg);
      }
    }

    return result;
  }

  private convertTools(tools?: readonly vscode.LanguageModelChatTool[]): any[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  public dispose(): void {
    this._onDidChangeLanguageModelChatInformation.dispose();
  }
}
