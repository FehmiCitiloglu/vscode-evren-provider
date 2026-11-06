import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { EvrenLanguageModelProvider } from './evrenProvider';

export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Evren LLM');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('[Evren] Activating Evren Provider (Unofficial) by Fehmi Çitiloğlu...');

  const configManager = new ConfigManager(context);
  const provider = new EvrenLanguageModelProvider(configManager, outputChannel);
  context.subscriptions.push(provider);

  // Register the Language Model Chat Provider
  try {
    const registration = vscode.lm.registerLanguageModelChatProvider('fehmicitiloglu-evren', provider);
    context.subscriptions.push(registration);
    outputChannel.appendLine('[Evren] Successfully registered LanguageModelChatProvider for vendor "fehmicitiloglu-evren".');
  } catch (err: any) {
    outputChannel.appendLine(`[Evren] Warning: Failed to register LanguageModelChatProvider directly: ${err.message}`);
  }

  // Command: Set API Key
  context.subscriptions.push(
    vscode.commands.registerCommand('evren.setApiKey', async () => {
      const currentKey = await configManager.getApiKey();
      const apiKey = await vscode.window.showInputBox({
        title: 'Evren LLM API Key',
        prompt: 'Enter your Evren API Key (stored securely in VS Code Keychain)',
        value: currentKey ? currentKey : '',
        password: true,
        ignoreFocusOut: true,
      });

      if (apiKey !== undefined) {
        if (apiKey.trim()) {
          await configManager.setApiKey(apiKey.trim());
          vscode.window.showInformationMessage('Evren API Key stored securely in VS Code Keychain.');
          await provider.refreshModels();
        } else {
          await configManager.clearApiKey();
          vscode.window.showInformationMessage('Evren API Key removed.');
          await provider.refreshModels();
        }
      }
    })
  );

  // Command: Clear API Key
  context.subscriptions.push(
    vscode.commands.registerCommand('evren.clearApiKey', async () => {
      await configManager.clearApiKey();
      vscode.window.showInformationMessage('Evren API Key has been cleared.');
      await provider.refreshModels();
    })
  );

  // Command: Refresh Models
  context.subscriptions.push(
    vscode.commands.registerCommand('evren.refreshModels', async () => {
      await provider.refreshModels();
      vscode.window.showInformationMessage('Evren model list refreshed successfully.');
    })
  );

  // Command: Open Settings
  context.subscriptions.push(
    vscode.commands.registerCommand('evren.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'evren');
    })
  );

  // Listen to configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('evren')) {
        outputChannel.appendLine('[Evren] Configuration changed, updating models...');
        await provider.refreshModels();
      }
    })
  );

  // Initial load
  const config = await configManager.getConfig();
  if (config.apiKey) {
    if (vscode.workspace.getConfiguration('evren').get('autoRefreshModels', true)) {
      provider.refreshModels().catch(() => {});
    }
  } else {
    outputChannel.appendLine('[Evren] No API key detected. Run "Evren: Set API Key" to enable.');
  }

  outputChannel.appendLine('[Evren] Extension activated successfully.');
}

export function deactivate() {}
