import * as vscode from 'vscode';
import { EvrenConfig, DEFAULT_SERVER_URL } from './types';

const SECRET_API_KEY_NAME = 'evren.apiKey';

export class ConfigManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public async getApiKey(): Promise<string> {
    // 1. Check SecretStorage (secure keychain)
    const secretKey = await this.context.secrets.get(SECRET_API_KEY_NAME);
    if (secretKey && secretKey.trim()) {
      return secretKey.trim();
    }

    // 2. Fallback to process.env
    if (process.env.EVREN_API_KEY && process.env.EVREN_API_KEY.trim()) {
      return process.env.EVREN_API_KEY.trim();
    }

    return '';
  }

  public async setApiKey(key: string): Promise<void> {
    await this.context.secrets.store(SECRET_API_KEY_NAME, key.trim());
  }

  public async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_API_KEY_NAME);
  }

  public async getConfig(): Promise<EvrenConfig> {
    const settings = vscode.workspace.getConfiguration('evren');
    const apiKey = await this.getApiKey();

    const serverUrl = settings.get<string>('serverUrl', DEFAULT_SERVER_URL).replace(/\/+$/, '');
    const parsedUrl = new URL(serverUrl);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
      throw new Error('Evren API endpoint must be an HTTPS URL without credentials, query parameters, or a fragment.');
    }

    return {
      serverUrl,
      apiKey,
      enableThinking: settings.get<boolean>('enableThinking', true),
      reasoningEffort: settings.get<string>('reasoningEffort', 'medium'),
      enableToolCalling: settings.get<boolean>('enableToolCalling', true),
      maxOutputTokens: settings.get<number>('maxOutputTokens', 16384),
      requestTimeout: settings.get<number>('requestTimeout', 120000),
    };
  }

}
