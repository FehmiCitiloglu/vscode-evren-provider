# Release validation — 1.1.0

Validated on 2026-11-06 on macOS arm64.

- `npm test`: 15 passing tests, including all effort variants, original model ID routing, default medium behavior, disabled global defaults, service capability overrides, model refresh invalidation, streaming, cancellation, and timeout handling.
- TypeScript compilation uses the stable VS Code 1.104 API types.
- A real VS Code 1.145.2 extension host, launched with a separate user-data profile and extensions directory and no Evren API key, successfully activated the extension and enumerated the default models plus all six MiMo effort variants through `vscode.lm.selectChatModels`.
- The native smoke test is in `test/native-smoke.cjs`; run it through VS Code's `--extensionDevelopmentPath` and `--extensionTestsPath` arguments. It verifies registration rather than making inference requests.
- The extension declares no proposed APIs. The nested effort submenu is not used; selectable effort variants use the stable model picker.
- No authenticated Evren inference was run. Payload routing and service capability combinations were tested with mocked API responses. Live service model availability and the service's per-model effort behavior remain dependent on the user's account and endpoint.
