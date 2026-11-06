# Evren Provider (Unofficial)

An independent, open-source extension by **Fehmi Çitiloğlu** that connects the Evren API to VS Code Chat through the stable Language Model Chat Provider API.

**This is an unofficial community project. It is not affiliated with, endorsed by, sponsored by, or maintained by the Evren service operator or its company. Evren and other product names belong to their respective owners.**

**Türkçe:** Bu eklenti Fehmi Çitiloğlu tarafından kişisel olarak geliştirilen, bağımsız ve gayriresmî bir açık kaynak projesidir. Evren hizmetini işleten şirketle herhangi bir kurumsal bağı yoktur; şirket tarafından yayımlanmaz, desteklenmez veya onaylanmaz.

## Requirements

- VS Code **1.104.0 or newer**.
- Access to VS Code Chat and its model picker. Account, plan, or organization policies may affect availability.
- Your own Evren API key and permission to use the service. Service access, pricing, and model availability are controlled by the service operator.

## Setup

1. Install **Evren Provider (Unofficial)**, published by **Fehmi Çitiloğlu**, from the Marketplace or install its VSIX with **Extensions: Install from VSIX**.
2. Run **Evren: Set API Key** from the Command Palette.
3. Open Chat's model picker or **Chat: Manage Language Models** and select an **Evren (Unofficial)** model.
4. Run **Evren: Refresh Available Models** after changing service access.

The extension supports streaming text and OpenAI-compatible tool calls. VS Code and the calling chat application control tool execution and approval. Reasoning effort is configurable for compatible models; separate reasoning text and image attachments are not supported in this version.

The extension queries `/models` and includes a fallback catalog. Catalog context sizes and capabilities are estimates inherited from the prototype, not a guarantee from the service operator. Token counting uses a conservative UTF-8 byte estimate rather than each model's exact tokenizer, so the usable context may be smaller than the advertised limit. Model compatibility varies; no live paid inference was used to validate this release.

## Commands

| Command | Purpose |
| --- | --- |
| Evren: Set API Key | Save a key in VS Code SecretStorage |
| Evren: Clear API Key | Remove the key stored by this extension |
| Evren: Refresh Available Models | Refresh the model list |
| Evren: Open Settings | Open extension settings |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `evren.serverUrl` | `https://evren-llmapi.ssyz.org.tr/v1` | HTTPS API base URL; credentials and selected conversation content are sent here |
| `evren.autoRefreshModels` | `true` | Discover models when a key is configured |
| `evren.enableThinking` | `true` | Send reasoning effort for compatible models |
| `evren.reasoningEffort` | `medium` | Reasoning effort requested from the service |
| `evren.enableToolCalling` | `true` | Allow tool definitions in requests |
| `evren.maxOutputTokens` | `16384` | Requested output limit |
| `evren.requestTimeout` | `120000` | Request timeout in milliseconds |

For development, `EVREN_API_KEY` is also accepted from the extension host environment. Clearing the stored key does not remove environment variables. The public release does not read API keys from plaintext VS Code settings and does not modify `chatLanguageModels.json`.

## Privacy and support

See [PRIVACY.md](PRIVACY.md) for data handling. The publisher does not operate the Evren API, collect extension telemetry, or receive users' API keys or conversations through a separate publisher service.

Report extension bugs at [GitHub Issues](https://github.com/FehmiCitiloglu/vscode-evren-provider/issues), or contact [Fehmi Çitiloğlu](mailto:fehmicitiloglu@gmail.com). Do not include API keys or private conversations in issues.

## Build from source

```sh
npm ci
npm test
npm run build
npx @vscode/vsce package
```

Source: [FehmiCitiloglu/vscode-evren-provider](https://github.com/FehmiCitiloglu/vscode-evren-provider).

## License

[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for prototype attribution.
