# Provider Overview Sync And Icons Design

## Goal

Fix the overview provider cards so they display the same active ASR/LLM providers selected in Settings, and replace the rough provider images with a consistent Qwen, Doubao, and Gemini icon set.

## Root Cause

Settings renders provider selections from `UserPreferences.activeAsrProvider` and `UserPreferences.activeLlmProvider`. Overview previously rendered provider cards from `getCredentials()`, and that command read `CredentialsVault.active` instead. If the preference store and credential vault diverged, Settings could show Qwen while Overview still showed Doubao.

## Design

`get_credentials` uses the current `UserPreferences` active provider ids as the source of truth for UI status. It still reads credentials from `CredentialsVault` to determine configured/not configured state, and opportunistically syncs the vault active provider ids back to the preference values to repair existing divergence.

Provider artwork is centralized behind `providerLogoSrc(providerId)`. Overview and Settings both use this helper. Icon assets live in `public/` so they are available in Tauri and Vite builds without bundler-specific imports.

The packaged assets use official site-declared resources rather than generated artwork:

- Qwen: `https://g.alicdn.com/qwenweb/qwen-ai-fe/0.0.4/favicon.ico`, discovered from `https://qwen.ai`.
- Doubao: `https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/192x192.png`, discovered from `https://www.doubao.com`.
- Gemini: `https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg`, discovered from `https://gemini.google.com`.

## Testing

The backend has a unit test for deriving credential status from preference active providers. The frontend contract test requires Overview and Settings to use `providerLogoSrc` instead of hard-coded old PNG names, and requires `get_credentials` to read `coord.prefs().get()`.
