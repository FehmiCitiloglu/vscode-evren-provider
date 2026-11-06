# Changelog

## 1.1.0

- Adds per-conversation effort selection through named entries in the Chat model picker, such as “MiMo v2.6 Pro · High”.
- Preserves existing default model IDs and the thinking-enabled / medium defaults. Explicit effort entries override global settings for that selection only.
- Reads reasoning-effort values, context limits, and tool capabilities from the Evren model API; does not advertise effort variants when the service reports them unsupported.
- Routes effort variants to the original API model ID and forwards the selected reasoning_effort.
- Keeps Marketplace compatibility through the stable provider API without enabling proposed APIs.

## 1.0.0

First independent public release under Fehmi Çitiloğlu.

- Clearly identifies the extension as unofficial and unaffiliated with the Evren operator.
- Uses VS Code's stable language model provider API with a VS Code 1.104 minimum.
- Adds the required token counting method and accurate text/tool capability declarations.
- Documents privacy, service dependencies, and validation limitations.
- Removes the prototype's native BYOK file-writing helper and plaintext settings-key fallback.
