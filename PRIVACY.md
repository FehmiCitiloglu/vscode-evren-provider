# Privacy

Evren Provider (Unofficial) is maintained independently by Fehmi Çitiloğlu.

- API keys entered with **Evren: Set API Key** are stored through VS Code SecretStorage. The extension also accepts `EVREN_API_KEY` from the extension host environment.
- Keys are sent as Bearer credentials to the configured HTTPS API endpoint. The default is `https://evren-llmapi.ssyz.org.tr/v1`.
- Chat requests send the selected model, conversation messages, tool definitions, tool results, and generation settings to that endpoint. Messages or tool results can include workspace code when supplied by the chat application.
- Model discovery sends an authenticated request to `/models` when configured.
- The extension does not add analytics or a separate publisher backend. It does not persist chat transcripts itself. VS Code and the API operator may handle data under their own policies.
- The local **Evren LLM** output channel records status, model identifiers, request counts, and tool names/identifiers. It does not intentionally log API keys, message text, or raw API error bodies.
- Changing the API endpoint changes the recipient of your credentials and conversation content. Use only an endpoint you trust.
- **Evren: Clear API Key** deletes the extension's saved key. Environment variables and keys saved by another extension must be removed separately.

Contact: fehmicitiloglu@gmail.com. Never send credentials in a public issue.
