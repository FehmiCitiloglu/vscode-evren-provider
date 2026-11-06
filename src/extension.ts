import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { EvrenLanguageModelProvider } from './evrenProvider';
import { sameAccountConnection, TermsService } from './termsService';
import { VscodeTermsUi } from './termsUi';

export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Evren LLM');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('[Evren] Activating Evren Provider (Unofficial) by Fehmi Çitiloğlu...');

  const configManager = new ConfigManager(context);
  const terms = new TermsService(configManager, new VscodeTermsUi(), async () => { await provider.refreshModels(); });
  const provider = new EvrenLanguageModelProvider(configManager, outputChannel, terms);
  context.subscriptions.push(terms, provider);

  try {
    context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider('fehmicitiloglu-evren', provider));
    outputChannel.appendLine('[Evren] Registered the language model provider.');
  } catch {
    outputChannel.appendLine('[Evren] Could not register the language model provider. Check VS Code compatibility.');
  }

  const command = (name: string, action: () => Promise<void>) => {
    context.subscriptions.push(vscode.commands.registerCommand(name, async () => {
      try { await action(); } catch (error) {
        const message = error instanceof Error ? error.message : 'The Evren operation failed.';
        outputChannel.appendLine(`[Evren] ${message}`);
        void vscode.window.showErrorMessage(message);
      }
    }));
  };

  command('evren.setApiKey', async () => {
    const apiKey = await vscode.window.showInputBox({
      title: 'Evren LLM API Key',
      prompt: 'Enter your Evren API key. Usage terms are reviewed separately before acceptance.',
      password: true,
      ignoreFocusOut: true,
    });
    if (apiKey === undefined) { return; }
    terms.invalidate();
    if (!apiKey.trim()) {
      await configManager.clearApiKey();
      void vscode.window.showInformationMessage('Saved Evren key removed. An EVREN_API_KEY environment variable may still apply.');
      await provider.refreshModels();
      return;
    }
    await configManager.setApiKey(apiKey.trim());
    void vscode.window.showInformationMessage('Evren API key stored in VS Code SecretStorage. Checking usage terms...');
    const config = await configManager.getConfig();
    if (await terms.ensureAccepted(config, undefined, true)) { await provider.refreshModels(); }
  });

  command('evren.clearApiKey', async () => {
    terms.invalidate();
    await configManager.clearApiKey();
    void vscode.window.showInformationMessage('Saved Evren key removed. An EVREN_API_KEY environment variable may still apply.');
    await provider.refreshModels();
  });

  command('evren.reviewTerms', async () => {
    const config = await configManager.getConfig();
    if (await terms.reviewAndAccept(config)) { await provider.refreshModels(); }
  });

  command('evren.refreshModels', async () => {
    const config = await configManager.getConfig();
    if (config.apiKey && !await terms.ensureAccepted(config)) { return; }
    if (await provider.refreshModels()) {
      void vscode.window.showInformationMessage('Evren model list refreshed.');
    } else {
      void vscode.window.showErrorMessage('Evren models could not be refreshed. Check your key, terms status, and service access.');
    }
  });

  command('evren.openSettings', async () => {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'evren');
  });

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('evren.serverUrl')) { terms.invalidate(); }
    if (e.affectsConfiguration('evren')) {
      outputChannel.appendLine('[Evren] Configuration changed, refreshing models...');
      void (async () => {
        const current = await configManager.getConfig();
        if (current.apiKey && !await terms.ensureAccepted(current)) { return; }
        await provider.refreshModels();
      })().catch(error => outputChannel.appendLine(`[Evren] Configuration refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }));

  // Also covers environment-variable keys and users upgrading from earlier releases.
  const config = await configManager.getConfig();
  if (config.apiKey) {
    void (async () => {
      if (await terms.ensureAccepted(config) && sameAccountConnection(config, await configManager.getConfig()) &&
          vscode.workspace.getConfiguration('evren').get('autoRefreshModels', true)) {
        await provider.refreshModels();
      }
    })().catch(error => {
      outputChannel.appendLine(`[Evren] Usage terms check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    });
  } else {
    outputChannel.appendLine('[Evren] No API key configured. Run "Evren: Set API Key" to begin.');
  }
  outputChannel.appendLine('[Evren] Extension activated.');
}

export function deactivate() {}
