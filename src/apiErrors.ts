export class EvrenApiError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(code === 'terms_not_accepted'
      ? 'Evren usage terms require acceptance. Run "Evren: Review and Accept Terms".'
      : `Evren API request failed (HTTP ${status}). Check your key, model access, and service status.`);
    this.name = 'EvrenApiError';
  }
}

// Never display or log raw upstream error bodies: they may contain private data.
export async function readJson(response: Response, maxBytes = 2 * 1024 * 1024): Promise<unknown> {
  if (!response.body) { throw new Error('The Evren API returned an empty response.'); }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { break; }
      size += value.byteLength;
      if (size > maxBytes) { throw new Error('The Evren API response exceeded the supported size.'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw new Error('The Evren API returned invalid JSON.'); }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function apiError(response: Response): Promise<EvrenApiError> {
  try {
    const body = await readJson(response, 65536) as any;
    const candidates = [body?.code, body?.error, body?.error?.code,
      body?.detail, body?.detail?.code, body?.detail?.error, body?.detail?.error?.code];
    if (response.status === 403 && candidates.includes('terms_not_accepted')) {
      return new EvrenApiError(response.status, 'terms_not_accepted');
    }
  } catch { /* Keep only the HTTP status for unrecognized or malformed bodies. */ }
  return new EvrenApiError(response.status);
}
