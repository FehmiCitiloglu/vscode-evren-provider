import { TermsClient, TermsDocument } from './termsClient';
import { EvrenConfig } from './types';

export interface ReviewCancellation {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export interface TermsUi {
  promptToReview(serverUrl: string, token?: ReviewCancellation): Promise<boolean>;
  review(document: TermsDocument, serverUrl: string, required: boolean, token?: ReviewCancellation): Promise<boolean>;
  info(message: string): void;
  close(): void;
}

export interface TermsGate {
  ensureAccepted(config: EvrenConfig, token?: ReviewCancellation, directlyReview?: boolean): Promise<boolean>;
  reviewAndAccept(config: EvrenConfig, token?: ReviewCancellation): Promise<boolean>;
}

export function sameAccountConnection(left: EvrenConfig, right: EvrenConfig): boolean {
  return left.serverUrl === right.serverUrl && left.apiKey === right.apiKey;
}

function cancellable(promise: Promise<boolean>, token?: ReviewCancellation): Promise<boolean> {
  if (!token) { return promise; }
  if (token.isCancellationRequested) { return Promise.resolve(false); }
  return new Promise((resolve, reject) => {
    let subscription: { dispose(): void } | undefined;
    const finish = (result: boolean) => { subscription?.dispose(); resolve(result); };
    subscription = token.onCancellationRequested(() => finish(false));
    promise.then(finish, error => { subscription?.dispose(); reject(error); });
    if (token.isCancellationRequested) { finish(false); }
  });
}

/** Acceptance is authoritative on the server; no local acceptance flag is persisted. */
export class TermsService implements TermsGate {
  private active?: { config: EvrenConfig; promise: Promise<boolean> };
  private revision = 0;
  private disposed = false;

  constructor(
    private readonly source: { getConfig(): Promise<EvrenConfig> },
    private readonly ui: TermsUi,
    private readonly onAccepted: () => Promise<void> = async () => {},
  ) {}

  public invalidate(): void {
    this.revision++;
    this.active = undefined;
    this.ui.close();
  }

  public dispose(): void {
    this.disposed = true;
    this.invalidate();
  }

  public ensureAccepted(config: EvrenConfig, token?: ReviewCancellation, directlyReview = false): Promise<boolean> {
    if (this.active && sameAccountConnection(this.active.config, config)) {
      return cancellable(this.active.promise, token);
    }
    return this.perform(config, token, async (client, valid, signal) => {
      const status = await client.status(signal);
      if (!await valid()) { return false; }
      if (status.accepted) { return true; }
      if (!directlyReview && !await this.ui.promptToReview(config.serverUrl, token)) { return false; }
      if (!await valid()) { return false; }
      return this.single(config, token, (currentClient, currentValid, currentSignal) =>
        this.review(currentClient, config, currentValid, currentSignal, token, false));
    });
  }

  public reviewAndAccept(config: EvrenConfig, token?: ReviewCancellation): Promise<boolean> {
    return this.single(config, token, (client, valid, signal) =>
      this.review(client, config, valid, signal, token, true));
  }

  private single(
    config: EvrenConfig,
    token: ReviewCancellation | undefined,
    operation: (client: TermsClient, valid: () => Promise<boolean>, signal: AbortSignal) => Promise<boolean>,
  ): Promise<boolean> {
    if (this.disposed || token?.isCancellationRequested) { return Promise.resolve(false); }
    if (this.active && sameAccountConnection(this.active.config, config)) {
      return cancellable(this.active.promise, token);
    }
    const promise = this.perform(config, token, operation);
    const active = { config, promise };
    this.active = active;
    // Both branches consume errors here; callers still receive the original promise.
    void promise.then(() => { if (this.active === active) { this.active = undefined; } },
      () => { if (this.active === active) { this.active = undefined; } });
    return cancellable(promise, token);
  }

  private perform(
    config: EvrenConfig,
    token: ReviewCancellation | undefined,
    operation: (client: TermsClient, valid: () => Promise<boolean>, signal: AbortSignal) => Promise<boolean>,
  ): Promise<boolean> {
    if (this.disposed || token?.isCancellationRequested) { return Promise.resolve(false); }
    const revision = this.revision;
    const controller = new AbortController();
    const subscription = token?.onCancellationRequested(() => controller.abort());
    const valid = async () => !this.disposed && !token?.isCancellationRequested &&
      revision === this.revision && sameAccountConnection(config, await this.source.getConfig());
    const promise = (async () => {
      try {
        if (!await valid()) { return false; }
        return await operation(new TermsClient(config), valid, controller.signal);
      } catch (error) {
        if (token?.isCancellationRequested || revision !== this.revision || this.disposed) { return false; }
        throw error;
      } finally {
        subscription?.dispose();
      }
    })();
    return cancellable(promise, token);
  }

  private async review(
    client: TermsClient,
    config: EvrenConfig,
    valid: () => Promise<boolean>,
    signal: AbortSignal,
    token: ReviewCancellation | undefined,
    force: boolean,
  ): Promise<boolean> {
    const status = await client.status(signal);
    if (!await valid()) { return false; }
    if (status.accepted && !force) { return true; }
    const document = await client.text(signal);
    if (!await valid()) { return false; }
    if (document.version !== status.current_version || document.doc_path !== status.doc_path) {
      this.ui.info('Evren terms changed while loading. Run "Evren: Review and Accept Terms" to load the latest text.');
      return false;
    }

    // The only acceptance path starts with an explicit action in the document UI.
    const consent = await this.ui.review(document, config.serverUrl, !status.accepted, token);
    if (!await valid()) {
      if (!token?.isCancellationRequested && !this.disposed) {
        this.ui.info('Your Evren key or endpoint changed. Reopen the terms for the current connection.');
      }
      return false;
    }
    if (status.accepted || !consent) { return status.accepted; }

    // Bind consent to the exact text and version shown, not whichever revision is newest.
    const currentStatus = await client.status(signal);
    if (!await valid()) { return false; }
    if (currentStatus.accepted) { return true; }
    const currentText = await client.text(signal);
    if (!await valid()) { return false; }
    if (currentStatus.current_version !== document.version || currentText.version !== document.version ||
        currentStatus.doc_path !== document.doc_path || currentText.doc_path !== document.doc_path ||
        currentText.content !== document.content) {
      this.ui.info('Evren terms changed during review. No acceptance was sent. Reopen and review the latest text.');
      return false;
    }

    // Never retry this POST automatically; a failed or stale review requires another user action.
    await client.accept(document.version, signal);
    const confirmed = await client.status(signal);
    if (!await valid()) { return false; }
    if (!confirmed.accepted) {
      this.ui.info('Evren still requires terms acceptance. Reopen the terms to check the latest version.');
      return false;
    }
    this.ui.info('Evren terms acceptance was confirmed for this account.');
    await this.onAccepted().catch(() => this.ui.info('Acceptance is confirmed. Run "Evren: Refresh Available Models" to refresh the model list.'));
    return true;
  }
}
