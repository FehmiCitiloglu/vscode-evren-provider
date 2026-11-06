import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { TermsDocument } from './termsClient';
import { ReviewCancellation, TermsUi } from './termsService';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]!));
}

export function termsHtml(document: TermsDocument, serverUrl: string, required: boolean, nonce: string): string {
  const version = document.version;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>Evren Usage Terms — Version ${version}</title>
<style nonce="${nonce}">
body { max-width: 960px; margin: 0 auto; padding: 24px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); line-height: 1.6; }
header { border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 20px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
footer { border-top: 1px solid var(--vscode-panel-border); margin-top: 24px; padding: 20px 0; }
label { display: block; margin-bottom: 16px; } button { padding: 8px 16px; margin-right: 12px; cursor: pointer; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
button:disabled { opacity: 0.5; cursor: default; } .note { color: var(--vscode-descriptionForeground); }
</style></head><body>
<header><h1>Evren Usage Terms</h1><p><strong>Version ${version}</strong></p>
<p>Service endpoint: <code>${escapeHtml(serverUrl)}</code><br>Document: <code>${escapeHtml(document.doc_path)}</code></p>
<p class="note">Terms supplied by the configured API service. This independent extension is not affiliated with the Evren operator.</p></header>
${required ? '<p>Review the complete text below before deciding. Acceptance will be recorded by the API for the account associated with your saved key.</p>' : '<p>No additional acceptance is currently required for this account. You can review the current document below.</p>'}
<main><pre>${escapeHtml(document.content)}</pre></main>
<footer>${required ? `<label><input id="consent" type="checkbox"> I have read and agree to the Evren usage terms, version ${version}.</label>
<button id="accept" disabled>Accept version ${version}</button>` : ''}
<button id="close">${required ? 'Cancel — do not accept' : 'Close'}</button><p class="note">Your API key stays in the extension host and is not included in this document.</p></footer>
<script nonce="${nonce}">
const api = acquireVsCodeApi();
document.getElementById('close').addEventListener('click', () => api.postMessage({ action: 'cancel' }));
${required ? `const checkbox = document.getElementById('consent');
const button = document.getElementById('accept');
checkbox.addEventListener('change', () => { button.disabled = !checkbox.checked; });
button.addEventListener('click', () => {
  if (!checkbox.checked || button.disabled) return;
  button.disabled = true; checkbox.disabled = true;
  api.postMessage({ action: 'accept', consent: true, version: ${version} });
});` : ''}
</script></body></html>`;
}

export class VscodeTermsUi implements TermsUi {
  private panel?: vscode.WebviewPanel;

  public info(message: string): void { void vscode.window.showInformationMessage(message); }
  public close(): void { this.panel?.dispose(); this.panel = undefined; }

  public async promptToReview(serverUrl: string, token?: ReviewCancellation): Promise<boolean> {
    if (token?.isCancellationRequested) { return false; }
    const answer = vscode.window.showInformationMessage(
      `Evren usage terms must be reviewed and accepted before using ${serverUrl}.`, 'Review Terms', 'Later');
    if (!token) { return (await answer) === 'Review Terms'; }
    return new Promise(resolve => {
      let subscription: { dispose(): void } | undefined;
      const finish = (result: boolean) => { subscription?.dispose(); resolve(result); };
      subscription = token.onCancellationRequested(() => finish(false));
      answer.then(value => finish(!token.isCancellationRequested && value === 'Review Terms'), () => finish(false));
      if (token.isCancellationRequested) { finish(false); }
    });
  }

  public review(document: TermsDocument, serverUrl: string, required: boolean, token?: ReviewCancellation): Promise<boolean> {
    if (token?.isCancellationRequested) { return Promise.resolve(false); }
    this.close();
    const panel = vscode.window.createWebviewPanel('evren.terms', `Evren Usage Terms — v${document.version}`,
      vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [], retainContextWhenHidden: true });
    this.panel = panel;
    return new Promise(resolve => {
      let settled = false;
      const subscriptions: Array<{ dispose(): void }> = [];
      const finish = (consent: boolean) => {
        if (settled) { return; }
        settled = true;
        for (const subscription of subscriptions) { subscription.dispose(); }
        if (this.panel === panel) { this.panel = undefined; }
        panel.dispose();
        resolve(consent);
      };
      subscriptions.push(panel.onDidDispose(() => finish(false)));
      subscriptions.push(panel.webview.onDidReceiveMessage(message => {
        if (message?.action === 'cancel') { finish(false); }
        if (required && message?.action === 'accept' && message.consent === true && message.version === document.version) {
          finish(!token?.isCancellationRequested);
        }
      }));
      if (token) { subscriptions.push(token.onCancellationRequested(() => finish(false))); }
      panel.webview.html = termsHtml(document, serverUrl, required, randomBytes(18).toString('hex'));
      if (token?.isCancellationRequested) { finish(false); }
    });
  }
}
