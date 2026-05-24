# Provider Overview Sync And Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Overview provider cards follow Settings selections and refresh provider icons across Overview and Settings.

**Architecture:** Treat `UserPreferences` as the source of truth for active provider ids, while `CredentialsVault` remains the credential/configured-state store. Centralize provider artwork through a small frontend helper.

**Tech Stack:** Rust/Tauri commands, React/TypeScript, Vite public assets, CSS.

---

### Task 1: Backend Provider Status Source

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [x] Write a failing/backend-targeted test for deriving credential status from preference provider ids.
- [x] Add `credentials_status_from_snapshot` as the pure tested helper.
- [x] Change `get_credentials` to accept `CoordinatorState` and read `coord.prefs().get()`.
- [x] Keep credential readiness checks based on `CredentialsSnapshot`.
- [x] Opportunistically sync `CredentialsVault.active` back to the preference provider ids.
- [x] Run `cargo test --lib credentials_status_uses_prefs_active_providers_for_overview`.

### Task 2: Provider Icon Mapping

**Files:**
- Create: `src/lib/providerBrand.ts`
- Create: `public/provider-qwen.ico`
- Create: `public/provider-doubao.png`
- Create: `public/provider-gemini.svg`
- Modify: `src/pages/Overview.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/styles/preview-replica.css`
- Modify: `src/lib/frontendReplicaContract.test.ts`

- [x] Add contract checks that reject old hard-coded provider PNG names.
- [x] Add `providerLogoSrc(providerId)`.
- [x] Replace generated icons with official site-declared Qwen, Doubao, and Gemini assets.
- [x] Replace Overview provider logo selection with the helper.
- [x] Replace Settings simple bundle logos with the helper.
- [x] Add active-provider icon badges to advanced Settings ASR/LLM sections.
- [x] Run `npx tsx src/lib/frontendReplicaContract.test.ts`.

### Task 3: Release Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`

- [x] Bump version to `1.3.7`.
- [x] Run full Rust tests.
- [x] Run frontend contract test.
- [x] Run production build.
- [x] Run Windows preflight and package script.
- [x] Launch the portable build for local use.
- [ ] Push `main`, tag `v1.3.7`, and publish the GitHub release assets.
