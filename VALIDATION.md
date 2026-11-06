# Release validation — 1.2.0

Validated on 2026-11-06 on macOS arm64.

- `npm test`: 52 passing tests. New cases cover exact-version consent, refusal, closing/cancellation, key/endpoint changes, document replacement, concurrent reviews, server confirmation, stale or malformed responses, and correct handling of terms-specific versus unrelated HTTP 403 errors.
- Provider tests verify that refused or unavailable terms checks prevent conversation content from reaching the chat endpoint, and that inference is never automatically retried after a terms rejection.
- UI tests verify an unchecked consent box and disabled acceptance button, no key in the webview, escaped service text, a restrictive content security policy, and rejection of wrong-version or missing-consent messages.
- A real VS Code 1.145.2 extension host in a separate profile activated the extension, registered the review command and effort models, opened a fixture-only terms webview, and closed it through cancellation with no acceptance.
- TypeScript compilation targets stable VS Code 1.104 API types; no proposed APIs are declared.
- Live service terms endpoints and their schemas were read from the public OpenAPI document. Acceptance POST behavior was tested only against mocked responses. No real account's agreement was accepted and no authenticated live inference was run.
- Run the native smoke test after `npm run compile` and `npm run build`, using VS Code's `--extensionDevelopmentPath` and `--extensionTestsPath` options with `test/native-smoke.cjs`. Use a separate user-data/extension profile without a real API key.

## Previous validation — 1.1.0

Validated on 2026-11-06 on macOS arm64.

- `npm test`: 15 passing tests, including all effort variants, original model ID routing, default medium behavior, disabled global defaults, service capability overrides, model refresh invalidation, streaming, cancellation, and timeout handling.
- TypeScript compilation uses the stable VS Code 1.104 API types.
- A real VS Code 1.145.2 extension host, launched with a separate user-data profile and extensions directory and no Evren API key, successfully activated the extension and enumerated the default models plus all six MiMo effort variants through `vscode.lm.selectChatModels`.
- The native smoke test is in `test/native-smoke.cjs`; run it through VS Code's `--extensionDevelopmentPath` and `--extensionTestsPath` arguments. It verifies registration rather than making inference requests.
- The extension declares no proposed APIs. The nested effort submenu is not used; selectable effort variants use the stable model picker.
- No authenticated Evren inference was run. Payload routing and service capability combinations were tested with mocked API responses. Live service model availability and the service's per-model effort behavior remain dependent on the user's account and endpoint.
