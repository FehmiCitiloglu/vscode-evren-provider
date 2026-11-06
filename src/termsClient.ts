import { apiError, readJson } from './apiErrors';
import { EvrenConfig } from './types';

export interface TermsStatus {
  current_version: number;
  is_material: boolean;
  doc_path: string;
  accepted: boolean;
}

export interface TermsDocument {
  version: number;
  doc_path: string;
  content: string;
}

function isVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export class TermsClient {
  constructor(private readonly config: EvrenConfig) {}

  private async request(path: string, signal?: AbortSignal, version?: number): Promise<any> {
    if (!this.config.apiKey) { throw new Error('Set your Evren API key before reviewing usage terms.'); }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timeout = setTimeout(cancel, Math.min(this.config.requestTimeout, 15000));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); }
    try {
      const response = await fetch(`${this.config.serverUrl}/terms/${path}`, {
        method: version === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        ...(version === undefined ? {} : { body: JSON.stringify({ version }) }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) { throw await apiError(response); }
      const data = await readJson(response);
      if (controller.signal.aborted) { throw new Error('Evren terms request cancelled or timed out.'); }
      return data;
    } catch (error) {
      if (controller.signal.aborted) { throw new Error('Evren terms request cancelled or timed out.'); }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  }

  public async status(signal?: AbortSignal): Promise<TermsStatus> {
    const data = await this.request('status', signal);
    if (!isVersion(data?.current_version) || typeof data?.accepted !== 'boolean' ||
        typeof data?.is_material !== 'boolean' || typeof data?.doc_path !== 'string') {
      throw new Error('The Evren API returned an invalid terms status. No acceptance was recorded.');
    }
    return data;
  }

  public async text(signal?: AbortSignal): Promise<TermsDocument> {
    const data = await this.request('text', signal);
    if (!isVersion(data?.version) || typeof data?.content !== 'string' || !data.content.trim() ||
        typeof data?.doc_path !== 'string') {
      throw new Error('The Evren API returned an invalid terms document. No acceptance was recorded.');
    }
    return data;
  }

  public async accept(version: number, signal?: AbortSignal): Promise<void> {
    if (!isVersion(version)) { throw new Error('A valid reviewed terms version is required.'); }
    const data = await this.request('accept', signal, version);
    if (data?.accepted_version !== version || typeof data?.accepted_at !== 'string' || !data.accepted_at) {
      throw new Error('The Evren API did not confirm the reviewed terms version. Check acceptance status again.');
    }
  }
}
