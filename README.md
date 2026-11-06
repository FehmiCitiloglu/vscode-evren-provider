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
2. Run **Evren: Set API Key** from the Command Palette. If your account has not accepted the required service terms, the extension opens a review document. Read it, check the agreement checkbox, and choose **Accept version …** to record your own decision.
3. Open Chat's model picker or **Chat: Manage Language Models** and select an **Evren (Unofficial)** model.
4. Run **Evren: Refresh Available Models** after changing service access.

## Review and accept Evren usage terms

Run **Evren: Review and Accept Terms** from the Command Palette at any time.

- The extension checks `/terms/status` after key setup, on startup for existing or environment keys, and before each chat request. If acceptance is needed, it offers **Review Terms**. Setting a key alone never accepts an agreement.
- The review tab shows the complete text from `/terms/text`, its version, document reference, and configured service endpoint. A checkbox and a separate **Accept version …** button are required. Closing the tab or choosing **Cancel** sends no acceptance.
- Acceptance posts only the displayed version to `/terms/accept`, using the saved key. The service records it for the key owner's account; the extension confirms the status with the server. There is no local flag that bypasses the service requirement.
- If the key, endpoint, text, or terms version changes during review, the previous consent is not submitted. Reopen the review for the current connection and document.
- Already accepted accounts can read the current document without submitting another acceptance. New required terms are detected from the server's status and `403 terms_not_accepted` responses.
- A blocked chat is not automatically sent again after review. Send the message yourself once acceptance is confirmed. If the terms service cannot be checked, chat content is not sent.
- The configured endpoint must support Evren's terms API. API keys are never embedded in the review webview; service-provided markup is displayed as inert text.

**Türkçe:** Komut paletinden **Evren: Review and Accept Terms** komutunu açın. Metni ve sürümünü okuyun; kabul etmek istiyorsanız kutucuğu işaretleyip **Accept version …** düğmesine basın. Bu işlem anahtar sahibinin hesabı adına Evren hizmetine onay gönderir. Vazgeçmek veya sekmeyi kapatmak onay göndermez.

## Select reasoning effort in Chat

Open the Chat model picker and select a model entry with an effort suffix, such as
**MiMo v2.6 Pro · High** or **DeepSeek V4.1 Flash · High** when advertised by the service.
The selected entry carries its effort into that conversation's requests; another
conversation can select a different entry. No settings editing is needed.

- The plain model name keeps the existing global defaults: thinking enabled and `medium` effort when supported.
- An explicit effort entry overrides the global thinking switch and effort for that selection only. Selecting **None**, when supported, sends `reasoning_effort: "none"`.
- Available levels come from the API's `capabilities.reasoning_effort_values`. If the API explicitly supports effort without enumerating values, Low / Medium / High are offered. Models that do not advertise effort support have no effort variants. Gateway aliases may map a selected level to a different upstream value.
- If a configured default level is unsupported, the plain model sends no effort parameter and uses the API default.
- The extension uses the stable VS Code API: effort levels appear as separate model entries, rather than the experimental nested effort submenu.
- If discovery is unavailable, only the prototype catalog's explicitly declared effort levels are offered. Refresh after setting your API key to discover the service's current capabilities.


The extension supports streaming text and OpenAI-compatible tool calls. VS Code and the calling chat application control tool execution and approval. Reasoning effort is configurable for compatible models; separate reasoning text and image attachments are not supported in this version.

The extension queries `/models` and includes a fallback catalog. Successful model discovery uses the service's context and capability metadata. The fallback catalog contains prototype estimates, not a guarantee from the service operator. Token counting uses a conservative UTF-8 byte estimate rather than each model's exact tokenizer, so the usable context may be smaller than the advertised limit. Model compatibility varies; no live paid inference was used to validate this release.

## Commands

| Command | Purpose |
| --- | --- |
| Evren: Set API Key | Save a key in VS Code SecretStorage |
| Evren: Clear API Key | Remove the key stored by this extension |
| Evren: Review and Accept Terms | Read the service terms and explicitly accept the reviewed version |
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
