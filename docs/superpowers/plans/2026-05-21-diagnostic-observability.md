# Diagnostic Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local structured diagnostic traces and a one-click diagnostic bundle export so ASR, LLM, and insertion failures can be analyzed from evidence before proposing fixes.

**Architecture:** Add a focused backend `diagnostics` module that owns trace types, JSONL persistence, evidence flags, redaction, and export bundle construction. Wire one `DiagnosticStore` into `Coordinator`, capture a trace per dictation session, expose `export_diagnostic_bundle` through Tauri IPC, and add a Settings privacy action to save the bundle.

**Tech Stack:** Rust/Tauri 2 backend, serde JSON/JSONL, existing `HistoryStore`, existing `openless.log`, React/TypeScript settings UI, existing plugin-dialog save flow.

---

## File Structure

- Create `src-tauri/src/diagnostics.rs`
  - Owns `DiagnosticTrace`, nested structs, `DiagnosticStore`, retention, evidence flags, redaction helpers, and export bundle assembly.
- Modify `src-tauri/src/lib.rs`
  - Registers `mod diagnostics`, manages one `DiagnosticStore`, and exposes `commands::export_diagnostic_bundle`.
- Modify `src-tauri/src/coordinator.rs`
  - Adds `diagnostics: DiagnosticStore` to `Inner` and exposes `diagnostics()` for commands.
- Modify `src-tauri/src/coordinator/dictation.rs`
  - Creates and completes a diagnostic trace around dictation lifecycle.
- Modify `src-tauri/src/asr/volcengine.rs`
  - Adds a lightweight diagnostics callback/event surface for Doubao/Volcengine connection and server-message facts.
- Modify `src-tauri/src/commands.rs`
  - Adds `export_diagnostic_bundle(target_path, recent_limit)` command and backend tests.
- Modify `src/lib/ipc.ts`
  - Adds `exportDiagnosticBundle`.
- Modify `src/pages/Settings.tsx`
  - Adds a privacy-section action button for diagnostic export.
- Modify `src/i18n/zh-CN.ts`, `src/i18n/en.ts`, and optionally `src/i18n/zh-TW.ts`, `src/i18n/ja.ts`, `src/i18n/ko.ts`
  - Adds labels and descriptions for the export action.

---

### Task 1: Backend Diagnostics Types And Store

**Files:**
- Create: `src-tauri/src/diagnostics.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing serialization, flag, redaction, and retention tests**

Add `src-tauri/src/diagnostics.rs` with tests first. The production structs can be introduced as part of the same file, but the assertions should reference behavior that is not yet implemented.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    fn sample_trace() -> DiagnosticTrace {
        DiagnosticTrace {
            schema_version: 1,
            trace_id: "trace-1".into(),
            created_at: "2026-05-21T00:00:00Z".into(),
            app: DiagnosticApp {
                version: "1.3.3".into(),
                platform: "windows".into(),
                arch: "x86_64".into(),
            },
            session: DiagnosticSession {
                mode: Some("Light".into()),
                hotkey_mode: Some("Hold".into()),
                front_app: Some("Google Chrome".into()),
                pressed_at: Some("2026-05-21T00:00:00Z".into()),
                released_at: Some("2026-05-21T00:00:33Z".into()),
                cancelled: false,
            },
            recorder: DiagnosticRecorderFacts {
                device_name: Some("Microphone".into()),
                input_sample_rate: Some(48000),
                output_sample_rate: Some(16000),
                pcm_bytes: Some(1_056_000),
                estimated_duration_ms: Some(33_000),
                last_rms: Some(0.007),
                peak_rms: Some(0.058),
            },
            asr: DiagnosticAsr {
                provider: Some("doubao-streaming-asr-2".into()),
                connected_at_ms: Some(1850),
                first_server_message_at_ms: Some(2310),
                last_server_message_at_ms: Some(8600),
                server_audio_duration_ms: Some(8600),
                socket_closed_at_ms: Some(28595),
                socket_error: Some("WSAECONNRESET 10054".into()),
                server_log_id: Some("server-log-id".into()),
                raw_text: Some("recognized text".into()),
                raw_chars: Some(15),
                final_missing_partial_used: true,
                frames_sent: Some(140),
                bytes_sent: Some(896000),
                pending_sends: Some(0),
            },
            llm: DiagnosticLlm {
                provider: Some("gemini".into()),
                mode: Some("Light".into()),
                short_input_bypass: false,
                streaming_insert_eligible: true,
                started_at_ms: Some(29200),
                finished_at_ms: Some(32900),
                error: None,
                final_text: Some("final".into()),
                final_chars: Some(5),
            },
            insertion: DiagnosticInsertion {
                status: Some("PasteSent".into()),
                method: Some("clipboard".into()),
                focus_restored: Some(true),
            },
            flags: Vec::new(),
        }
    }

    #[test]
    fn evidence_flags_are_factual_not_root_cause_claims() {
        let mut trace = sample_trace();
        trace.compute_flags();

        assert!(trace.flags.contains(&"asr_connection_reset_before_hotkey_release".to_string()));
        assert!(trace.flags.contains(&"local_audio_continued_after_asr_disconnect".to_string()));
        assert!(trace.flags.contains(&"server_audio_duration_shorter_than_local_recording".to_string()));
        assert!(trace.flags.contains(&"asr_final_missing_partial_used".to_string()));
        assert!(trace.flags.contains(&"llm_output_much_shorter_than_raw".to_string()));
        assert!(trace.flags.contains(&"insert_unverified_paste_sent".to_string()));
        assert!(!trace.flags.iter().any(|flag| flag.contains("root_cause")));
    }

    #[test]
    fn settings_summary_redacts_secret_like_values() {
        let value = json!({
            "activeAsrProvider": "doubao-streaming-asr-2",
            "apiKey": "sk-secret",
            "accessToken": "token-secret",
            "nested": { "authorization": "Bearer abc" },
            "streamingInsert": true
        });

        let redacted = redact_secrets(value);

        assert_eq!(redacted["apiKey"], "[REDACTED]");
        assert_eq!(redacted["accessToken"], "[REDACTED]");
        assert_eq!(redacted["nested"]["authorization"], "[REDACTED]");
        assert_eq!(redacted["activeAsrProvider"], "doubao-streaming-asr-2");
        assert_eq!(redacted["streamingInsert"], true);
    }

    #[test]
    fn diagnostic_store_retains_latest_200_and_drops_old_records() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("diagnostics.jsonl");
        let store = DiagnosticStore::with_path(path.clone());

        for i in 0..205 {
            let mut trace = sample_trace();
            trace.trace_id = format!("trace-{i}");
            trace.created_at = "2026-05-21T00:00:00Z".into();
            store.append_with_now(trace, chrono::DateTime::parse_from_rfc3339("2026-05-21T00:00:00Z").unwrap().with_timezone(&chrono::Utc)).unwrap();
        }

        let traces = store.list_recent(250).unwrap();
        assert_eq!(traces.len(), 200);
        assert_eq!(traces[0].trace_id, "trace-204");
        assert_eq!(traces[199].trace_id, "trace-5");
    }

    #[test]
    fn export_bundle_contains_expected_sections() {
        let traces = vec![sample_trace()];
        let history = vec![crate::types::DictationSession {
            id: "history-1".into(),
            created_at: "2026-05-21T00:00:00Z".into(),
            raw_transcript: "raw".into(),
            final_text: "final".into(),
            mode: crate::types::PolishMode::Light,
            app_bundle_id: None,
            app_name: None,
            insert_status: crate::types::InsertStatus::Inserted,
            error_code: None,
            duration_ms: Some(1000),
            dictionary_entry_count: Some(0),
            asr_provider_id: Some("doubao-streaming-asr-2".into()),
            llm_provider_id: Some("gemini".into()),
        }];
        let bundle = DiagnosticBundle::new(
            traces,
            history,
            "log tail".into(),
            serde_json::json!({ "apiKey": "secret", "activeAsrProvider": "doubao-streaming-asr-2" }),
        );

        let json = serde_json::to_value(bundle).unwrap();
        assert_eq!(json["diagnostics"].as_array().unwrap().len(), 1);
        assert_eq!(json["history"].as_array().unwrap().len(), 1);
        assert_eq!(json["logExcerpt"], "log tail");
        assert_eq!(json["settingsSummary"]["apiKey"], "[REDACTED]");
    }
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cargo test diagnostics --lib
```

Expected: compilation fails because `DiagnosticTrace`, `DiagnosticStore`, `DiagnosticBundle`, and `redact_secrets` are not implemented.

- [ ] **Step 3: Implement diagnostics structs and store**

Add the production implementation in `src-tauri/src/diagnostics.rs`.

```rust
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const DIAGNOSTIC_CAP: usize = 200;
const DIAGNOSTIC_RETENTION_DAYS: i64 = 7;
const DIAGNOSTIC_FILE: &str = "diagnostics.jsonl";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticTrace {
    pub schema_version: u32,
    pub trace_id: String,
    pub created_at: String,
    pub app: DiagnosticApp,
    pub session: DiagnosticSession,
    pub recorder: DiagnosticRecorderFacts,
    pub asr: DiagnosticAsr,
    pub llm: DiagnosticLlm,
    pub insertion: DiagnosticInsertion,
    #[serde(default)]
    pub flags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticApp {
    pub version: String,
    pub platform: String,
    pub arch: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSession {
    pub mode: Option<String>,
    pub hotkey_mode: Option<String>,
    pub front_app: Option<String>,
    pub pressed_at: Option<String>,
    pub released_at: Option<String>,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRecorderFacts {
    pub device_name: Option<String>,
    pub input_sample_rate: Option<u32>,
    pub output_sample_rate: Option<u32>,
    pub pcm_bytes: Option<u64>,
    pub estimated_duration_ms: Option<u64>,
    pub last_rms: Option<f64>,
    pub peak_rms: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticAsr {
    pub provider: Option<String>,
    pub connected_at_ms: Option<u64>,
    pub first_server_message_at_ms: Option<u64>,
    pub last_server_message_at_ms: Option<u64>,
    pub server_audio_duration_ms: Option<u64>,
    pub socket_closed_at_ms: Option<u64>,
    pub socket_error: Option<String>,
    pub server_log_id: Option<String>,
    pub raw_text: Option<String>,
    pub raw_chars: Option<u32>,
    pub final_missing_partial_used: bool,
    pub frames_sent: Option<u64>,
    pub bytes_sent: Option<u64>,
    pub pending_sends: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticLlm {
    pub provider: Option<String>,
    pub mode: Option<String>,
    pub short_input_bypass: bool,
    pub streaming_insert_eligible: bool,
    pub started_at_ms: Option<u64>,
    pub finished_at_ms: Option<u64>,
    pub error: Option<String>,
    pub final_text: Option<String>,
    pub final_chars: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticInsertion {
    pub status: Option<String>,
    pub method: Option<String>,
    pub focus_restored: Option<bool>,
}

impl DiagnosticTrace {
    pub fn compute_flags(&mut self) {
        let mut flags = Vec::new();
        if self.asr.socket_error.is_some() && self.session.released_at.is_some() {
            flags.push("asr_connection_reset_before_hotkey_release".to_string());
        }
        if let (Some(socket_ms), Some(local_ms)) =
            (self.asr.socket_closed_at_ms, self.recorder.estimated_duration_ms)
        {
            if local_ms > socket_ms + 500 {
                flags.push("local_audio_continued_after_asr_disconnect".to_string());
            }
        }
        if let (Some(server_ms), Some(local_ms)) =
            (self.asr.server_audio_duration_ms, self.recorder.estimated_duration_ms)
        {
            if server_ms + 1000 < local_ms {
                flags.push("server_audio_duration_shorter_than_local_recording".to_string());
            }
        }
        if self.asr.final_missing_partial_used {
            flags.push("asr_final_missing_partial_used".to_string());
        }
        if let (Some(raw), Some(final_chars)) = (self.asr.raw_chars, self.llm.final_chars) {
            if raw >= 30 && final_chars.saturating_mul(100) < raw.saturating_mul(60) {
                flags.push("llm_output_much_shorter_than_raw".to_string());
            }
        }
        if self.insertion.status.as_deref() == Some("PasteSent") {
            flags.push("insert_unverified_paste_sent".to_string());
        }
        if self.insertion.focus_restored == Some(false) {
            flags.push("focus_not_ready_for_paste".to_string());
        }
        self.flags = flags;
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticBundle {
    diagnostics: Vec<DiagnosticTrace>,
    history: Vec<crate::types::DictationSession>,
    log_excerpt: String,
    settings_summary: Value,
    environment: Value,
}

impl DiagnosticBundle {
    pub fn new(
        diagnostics: Vec<DiagnosticTrace>,
        history: Vec<crate::types::DictationSession>,
        log_excerpt: String,
        settings_summary: Value,
    ) -> Self {
        Self {
            diagnostics,
            history,
            log_excerpt,
            settings_summary: redact_secrets(settings_summary),
            environment: serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH
            }),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DiagnosticStore {
    inner: Arc<DiagnosticStoreInner>,
}

#[derive(Debug)]
struct DiagnosticStoreInner {
    path: PathBuf,
    lock: Mutex<()>,
}

impl DiagnosticStore {
    pub fn new() -> Result<Self> {
        let dir = crate::persistence::app_data_dir()?;
        fs::create_dir_all(&dir).context("create diagnostics data dir failed")?;
        Ok(Self::with_path(dir.join(DIAGNOSTIC_FILE)))
    }

    pub fn with_path(path: PathBuf) -> Self {
        Self {
            inner: Arc::new(DiagnosticStoreInner {
                path,
                lock: Mutex::new(()),
            }),
        }
    }

    pub fn append(&self, trace: DiagnosticTrace) -> Result<()> {
        self.append_with_now(trace, Utc::now())
    }

    pub fn append_with_now(&self, mut trace: DiagnosticTrace, now: DateTime<Utc>) -> Result<()> {
        trace.compute_flags();
        let _guard = self.inner.lock.lock();
        let mut traces = self.read_all_locked()?;
        traces.insert(0, trace);
        let cutoff = now - Duration::days(DIAGNOSTIC_RETENTION_DAYS);
        traces.retain(|trace| {
            DateTime::parse_from_rfc3339(&trace.created_at)
                .map(|t| t.with_timezone(&Utc) >= cutoff)
                .unwrap_or(true)
        });
        if traces.len() > DIAGNOSTIC_CAP {
            traces.truncate(DIAGNOSTIC_CAP);
        }
        self.write_all_locked(&traces)
    }

    pub fn list_recent(&self, limit: usize) -> Result<Vec<DiagnosticTrace>> {
        let _guard = self.inner.lock.lock();
        let mut traces = self.read_all_locked()?;
        if traces.len() > limit {
            traces.truncate(limit);
        }
        Ok(traces)
    }

    fn read_all_locked(&self) -> Result<Vec<DiagnosticTrace>> {
        if !self.inner.path.exists() {
            return Ok(Vec::new());
        }
        let file = fs::File::open(&self.inner.path).context("open diagnostics file failed")?;
        let reader = BufReader::new(file);
        let mut traces = Vec::new();
        for line in reader.lines() {
            let line = line.context("read diagnostics line failed")?;
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<DiagnosticTrace>(&line) {
                Ok(trace) => traces.push(trace),
                Err(err) => log::warn!("[diagnostics] skipping malformed trace line: {err}"),
            }
        }
        Ok(traces)
    }

    fn write_all_locked(&self, traces: &[DiagnosticTrace]) -> Result<()> {
        if let Some(parent) = self.inner.path.parent() {
            fs::create_dir_all(parent).context("create diagnostics parent failed")?;
        }
        let tmp = self.inner.path.with_extension("jsonl.tmp");
        {
            let mut file = fs::File::create(&tmp).context("create diagnostics temp failed")?;
            for trace in traces {
                serde_json::to_writer(&mut file, trace).context("encode diagnostic trace failed")?;
                file.write_all(b"\n").context("write diagnostic newline failed")?;
            }
            file.sync_all().context("sync diagnostics temp failed")?;
        }
        fs::rename(&tmp, &self.inner.path).context("replace diagnostics file failed")
    }
}

pub fn redact_secrets(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, value)| {
                    let lower = key.to_ascii_lowercase();
                    if lower.contains("apikey")
                        || lower.contains("api_key")
                        || lower.contains("token")
                        || lower.contains("secret")
                        || lower.contains("authorization")
                    {
                        (key, Value::String("[REDACTED]".into()))
                    } else {
                        (key, redact_secrets(value))
                    }
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(redact_secrets).collect()),
        other => other,
    }
}

pub fn read_log_tail(path: &Path, max_bytes: usize) -> Result<String> {
    if !path.exists() {
        return Ok(String::new());
    }
    let bytes = fs::read(path).context("read log file failed")?;
    let start = bytes.len().saturating_sub(max_bytes);
    Ok(String::from_utf8_lossy(&bytes[start..]).to_string())
}
```

- [ ] **Step 4: Expose app data directory**

In `src-tauri/src/persistence.rs`, add a public wrapper near `fn data_dir()`.

```rust
pub fn app_data_dir() -> Result<PathBuf> {
    data_dir()
}
```

In `src-tauri/src/lib.rs`, add the module:

```rust
mod diagnostics;
```

- [ ] **Step 5: Run diagnostics tests**

Run:

```powershell
cargo test diagnostics --lib
```

Expected: all diagnostics tests pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src-tauri/src/diagnostics.rs src-tauri/src/persistence.rs src-tauri/src/lib.rs
git commit -m "feat: add diagnostic trace store"
```

---

### Task 2: Export Diagnostic Bundle Command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing command/export tests**

In `src-tauri/src/commands.rs` test module, add tests for settings summary redaction and export shape through `DiagnosticBundle`. Keep command tests focused on helper functions so they do not need a full Tauri app.

```rust
#[test]
fn diagnostic_settings_summary_omits_credentials() {
    let prefs = UserPreferences::default();
    let summary = diagnostic_settings_summary(&prefs, "doubao-streaming-asr-2", "gemini");

    assert_eq!(summary["activeAsrProvider"], "doubao-streaming-asr-2");
    assert_eq!(summary["activeLlmProvider"], "gemini");
    assert!(summary.get("apiKey").is_none());
    assert!(summary.get("accessToken").is_none());
}

#[test]
fn normalize_diagnostic_limit_uses_safe_bounds() {
    assert_eq!(normalize_diagnostic_limit(None), 50);
    assert_eq!(normalize_diagnostic_limit(Some(0)), 1);
    assert_eq!(normalize_diagnostic_limit(Some(500)), 200);
    assert_eq!(normalize_diagnostic_limit(Some(25)), 25);
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cargo test diagnostic_settings_summary_omits_credentials normalize_diagnostic_limit_uses_safe_bounds --lib
```

Expected: compilation fails because the helper functions do not exist.

- [ ] **Step 3: Implement helper functions and Tauri command**

In `src-tauri/src/commands.rs`, add imports:

```rust
use crate::diagnostics::{read_log_tail, DiagnosticBundle, DiagnosticStore};
```

Add helper functions near the history/export section:

```rust
fn normalize_diagnostic_limit(limit: Option<usize>) -> usize {
    limit.unwrap_or(50).clamp(1, 200)
}

fn diagnostic_settings_summary(
    prefs: &UserPreferences,
    active_asr_provider: &str,
    active_llm_provider: &str,
) -> serde_json::Value {
    serde_json::json!({
        "activeAsrProvider": active_asr_provider,
        "activeLlmProvider": active_llm_provider,
        "defaultMode": prefs.default_mode,
        "hotkeyMode": prefs.hotkey.mode,
        "streamingInsert": prefs.streaming_insert,
        "historyEnabled": prefs.history_enabled,
        "historyRetentionDays": prefs.history_retention_days,
        "polishContextWindowMinutes": prefs.polish_context_window_minutes,
        "restoreClipboardAfterPaste": prefs.restore_clipboard_after_paste,
        "allowNonTsfInsertionFallback": prefs.allow_non_tsf_insertion_fallback
    })
}
```

Add command:

```rust
#[tauri::command]
pub fn export_diagnostic_bundle(
    coord: CoordinatorState<'_>,
    diagnostics: State<'_, DiagnosticStore>,
    target_path: String,
    recent_limit: Option<usize>,
) -> Result<(), String> {
    let limit = normalize_diagnostic_limit(recent_limit);
    let traces = diagnostics.list_recent(limit).map_err(|e| e.to_string())?;
    let mut history = coord.history().list().map_err(|e| e.to_string())?;
    if history.len() > limit {
        history.truncate(limit);
    }
    let prefs = coord.prefs().get();
    let settings_summary = diagnostic_settings_summary(
        &prefs,
        &CredentialsVault::get_active_asr(),
        &CredentialsVault::get_active_llm(),
    );
    let log_path = crate::log_dir_path().join("openless.log");
    let log_excerpt = read_log_tail(&log_path, 256 * 1024).map_err(|e| e.to_string())?;
    let bundle = DiagnosticBundle::new(traces, history, log_excerpt, settings_summary);
    let bytes = serde_json::to_vec_pretty(&bundle).map_err(|e| e.to_string())?;
    std::fs::write(std::path::Path::new(&target_path), bytes)
        .map_err(|e| format!("写入诊断包失败：{e}"))
}
```

- [ ] **Step 4: Register store and command**

In `src-tauri/src/lib.rs`, create and manage the store in `run()` after existing service construction:

```rust
let diagnostic_store = diagnostics::DiagnosticStore::new()
    .expect("initialize diagnostic store");
```

Register it:

```rust
.manage(diagnostic_store)
```

Add command to `tauri::generate_handler!` near `commands::export_error_log`:

```rust
commands::export_diagnostic_bundle,
```

- [ ] **Step 5: Run command tests**

Run:

```powershell
cargo test diagnostic_settings_summary_omits_credentials normalize_diagnostic_limit_uses_safe_bounds --lib
```

Expected: both tests pass.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: export diagnostic bundles"
```

---

### Task 3: Capture Dictation-Level Diagnostic Trace

**Files:**
- Modify: `src-tauri/src/coordinator.rs`
- Modify: `src-tauri/src/coordinator/dictation.rs`
- Modify: `src-tauri/src/lib.rs` if constructor signatures need wiring updates

- [ ] **Step 1: Write failing trace builder tests**

In `src-tauri/src/coordinator/dictation.rs` tests, add pure helper tests for insertion method and compression flags. The helper functions will be added in the dictation module to keep coordinator wiring small.

```rust
#[test]
fn diagnostic_insert_method_describes_streaming_and_clipboard_paths() {
    assert_eq!(diagnostic_insert_method(true, true), "streaming-unicode");
    assert_eq!(diagnostic_insert_method(false, true), "clipboard-or-tsf");
    assert_eq!(diagnostic_insert_method(false, false), "copy-fallback");
}

#[test]
fn diagnostic_trace_records_raw_and_final_lengths() {
    let mut trace = diagnostic_trace_for_test("trace-test");
    complete_trace_texts(&mut trace, "这是原始识别文本", "这是最终文本", InsertStatus::PasteSent);

    assert_eq!(trace.asr.raw_chars, Some(8));
    assert_eq!(trace.llm.final_chars, Some(6));
    assert_eq!(trace.insertion.status.as_deref(), Some("PasteSent"));
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cargo test diagnostic_insert_method_describes_streaming_and_clipboard_paths diagnostic_trace_records_raw_and_final_lengths --lib
```

Expected: compilation fails because helper functions do not exist.

- [ ] **Step 3: Add diagnostics store to Coordinator**

In `src-tauri/src/coordinator.rs`, import:

```rust
use crate::diagnostics::DiagnosticStore;
```

Add to `Inner`:

```rust
    diagnostics: DiagnosticStore,
```

Update `Coordinator` constructors to accept a shared diagnostic store instead of creating a second store. For each constructor that creates `Inner`, add `diagnostics: DiagnosticStore` as the final parameter and assign it directly into the `Inner` initializer:

```rust
pub fn new_with_foundry_runtime_and_qingyu(
    foundry_local_runtime: Arc<FoundryLocalRuntime>,
    qingyu_local_asr: Arc<crate::asr::qingyu::QingyuLocalAsrService>,
    diagnostics: DiagnosticStore,
) -> Self {
    Self {
        inner: Arc::new(Inner {
            diagnostics,
        }),
    }
}
```

Apply the same pattern to `Coordinator::new`, `Coordinator::new_with_foundry_runtime`, and `Coordinator::new_with_qingyu_local_asr`. Existing fields remain as they are today; the only constructor behavior change is receiving the shared store instead of allocating one internally.

Add accessor:

```rust
pub fn diagnostics(&self) -> &DiagnosticStore {
    &self.inner.diagnostics
}
```

In `src-tauri/src/lib.rs`, create `diagnostic_store` before constructing `Coordinator`, pass `diagnostic_store.clone()` into the coordinator constructor, and also register the same `diagnostic_store` with `.manage(diagnostic_store)`. There must be exactly one shared store instance.

- [ ] **Step 4: Implement dictation trace helpers**

In `src-tauri/src/coordinator/dictation.rs`, import diagnostics:

```rust
use crate::diagnostics::{
    DiagnosticApp, DiagnosticAsr, DiagnosticInsertion, DiagnosticLlm, DiagnosticRecorderFacts,
    DiagnosticSession, DiagnosticTrace,
};
```

Add helpers near other private helpers:

```rust
fn diagnostic_insert_method(already_streamed: bool, focus_ready_for_paste: bool) -> &'static str {
    if already_streamed {
        "streaming-unicode"
    } else if focus_ready_for_paste {
        "clipboard-or-tsf"
    } else {
        "copy-fallback"
    }
}

fn new_dictation_trace(
    trace_id: String,
    mode: PolishMode,
    hotkey_mode: crate::types::HotkeyMode,
    front_app: Option<String>,
    asr_provider_id: String,
    llm_provider_id: String,
) -> DiagnosticTrace {
    DiagnosticTrace {
        schema_version: 1,
        trace_id,
        created_at: Utc::now().to_rfc3339(),
        app: DiagnosticApp {
            version: env!("CARGO_PKG_VERSION").into(),
            platform: std::env::consts::OS.into(),
            arch: std::env::consts::ARCH.into(),
        },
        session: DiagnosticSession {
            mode: Some(format!("{mode:?}")),
            hotkey_mode: Some(format!("{hotkey_mode:?}")),
            front_app,
            pressed_at: Some(Utc::now().to_rfc3339()),
            released_at: None,
            cancelled: false,
        },
        recorder: DiagnosticRecorderFacts::default(),
        asr: DiagnosticAsr {
            provider: Some(asr_provider_id),
            ..Default::default()
        },
        llm: DiagnosticLlm {
            provider: Some(llm_provider_id),
            mode: Some(format!("{mode:?}")),
            ..Default::default()
        },
        insertion: DiagnosticInsertion::default(),
        flags: Vec::new(),
    }
}

fn complete_trace_texts(
    trace: &mut DiagnosticTrace,
    raw_text: &str,
    final_text: &str,
    status: InsertStatus,
) {
    trace.asr.raw_text = Some(raw_text.to_string());
    trace.asr.raw_chars = Some(raw_text.chars().count().min(u32::MAX as usize) as u32);
    trace.llm.final_text = Some(final_text.to_string());
    trace.llm.final_chars = Some(final_text.chars().count().min(u32::MAX as usize) as u32);
    trace.insertion.status = Some(format!("{status:?}"));
}
```

Add test-only constructor:

```rust
#[cfg(test)]
fn diagnostic_trace_for_test(trace_id: &str) -> DiagnosticTrace {
    new_dictation_trace(
        trace_id.to_string(),
        PolishMode::Light,
        crate::types::HotkeyMode::Hold,
        Some("Test App".into()),
        "doubao-streaming-asr-2".into(),
        "gemini".into(),
    )
}
```

- [ ] **Step 5: Wire trace capture into `end_session`**

In `end_session`, create a trace after `prefs`, `mode`, `asr_provider_id`, `llm_provider_id`, and `front_app` are known.

```rust
let trace_id = Uuid::new_v4().to_string();
let mut diagnostic_trace = new_dictation_trace(
    trace_id,
    mode,
    prefs.hotkey.mode,
    front_app.clone(),
    asr_provider_id.clone(),
    llm_provider_id.clone(),
);
diagnostic_trace.session.released_at = Some(Utc::now().to_rfc3339());
```

After ASR returns `raw`, set:

```rust
diagnostic_trace.recorder.estimated_duration_ms = Some(raw.duration_ms);
diagnostic_trace.asr.raw_text = Some(raw.text.clone());
diagnostic_trace.asr.raw_chars = Some(raw.text.chars().count().min(u32::MAX as usize) as u32);
```

Before LLM call:

```rust
let llm_start = Instant::now();
diagnostic_trace.llm.short_input_bypass = short_transcript_llm_bypass;
diagnostic_trace.llm.streaming_insert_eligible = streaming_eligible;
diagnostic_trace.llm.started_at_ms = Some(elapsed);
```

After LLM/polish:

```rust
diagnostic_trace.llm.finished_at_ms =
    Some(elapsed.saturating_add(llm_start.elapsed().as_millis() as u64));
diagnostic_trace.llm.error = polish_error.clone();
diagnostic_trace.llm.final_text = Some(polished.clone());
diagnostic_trace.llm.final_chars = Some(polished.chars().count().min(u32::MAX as usize) as u32);
```

After insertion:

```rust
diagnostic_trace.insertion.status = Some(format!("{status:?}"));
diagnostic_trace.insertion.method = Some(diagnostic_insert_method(already_streamed, focus_ready_for_paste).to_string());
diagnostic_trace.insertion.focus_restored = Some(focus_ready_for_paste);
diagnostic_trace.compute_flags();
if let Err(error) = inner.diagnostics.append(diagnostic_trace) {
    log::warn!("[diagnostics] append dictation trace failed: {error}");
}
```

For early empty transcript errors, append a trace before returning using raw duration and `error` in `llm.error` or a factual flag where available.

- [ ] **Step 6: Run dictation diagnostic tests**

Run:

```powershell
cargo test diagnostic_insert_method_describes_streaming_and_clipboard_paths diagnostic_trace_records_raw_and_final_lengths --lib
```

Expected: tests pass.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src-tauri/src/coordinator.rs src-tauri/src/coordinator/dictation.rs src-tauri/src/lib.rs
git commit -m "feat: record dictation diagnostic traces"
```

---

### Task 4: Add Doubao/Volcengine ASR Diagnostic Events

**Files:**
- Modify: `src-tauri/src/asr/volcengine.rs`
- Modify: `src-tauri/src/coordinator/dictation.rs`

- [ ] **Step 1: Write failing Volcengine diagnostics tests**

In `src-tauri/src/asr/volcengine.rs` tests, add pure tests for parsing diagnostic facts out of server JSON and error strings.

```rust
#[test]
fn diagnostic_facts_extract_log_id_and_audio_duration() {
    let payload = serde_json::json!({
        "audio_info": { "duration": 8600 },
        "result": {
            "additions": { "log_id": "202605210158088D7BA12160111239CBDF" },
            "text": "首先我不确定"
        }
    });

    let facts = diagnostic_facts_from_server_json(&payload);

    assert_eq!(facts.server_audio_duration_ms, Some(8600));
    assert_eq!(facts.server_log_id.as_deref(), Some("202605210158088D7BA12160111239CBDF"));
}

#[test]
fn diagnostic_snapshot_reports_send_counters() {
    let asr = VolcengineStreamingASR::new(
        VolcengineCredentials {
            api_key: "key".into(),
            app_id: String::new(),
            access_token: String::new(),
            endpoint: DEFAULT_ENDPOINT.into(),
            resource_id: DEFAULT_RESOURCE_ID.into(),
        },
        Vec::new(),
    );

    let snapshot = asr.diagnostic_snapshot();

    assert_eq!(snapshot.frames_sent, Some(0));
    assert_eq!(snapshot.bytes_sent, Some(0));
    assert_eq!(snapshot.pending_sends, Some(0));
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cargo test diagnostic_facts_extract_log_id_and_audio_duration diagnostic_snapshot_reports_send_counters --lib
```

Expected: compilation fails because `diagnostic_facts_from_server_json` and `diagnostic_snapshot` do not exist.

- [ ] **Step 3: Add diagnostic snapshot types**

In `src-tauri/src/asr/volcengine.rs`, add:

```rust
#[derive(Debug, Clone, Default)]
pub struct VolcengineDiagnosticSnapshot {
    pub server_audio_duration_ms: Option<u64>,
    pub server_log_id: Option<String>,
    pub socket_error: Option<String>,
    pub frames_sent: Option<u64>,
    pub bytes_sent: Option<u64>,
    pub pending_sends: Option<u64>,
    pub final_missing_partial_used: bool,
}
```

Extend `SyncState`:

```rust
last_server_audio_duration_ms: Option<u64>,
last_server_log_id: Option<String>,
last_socket_error: Option<String>,
final_missing_partial_used: bool,
```

Add helper:

```rust
fn diagnostic_facts_from_server_json(json: &Value) -> VolcengineDiagnosticSnapshot {
    let result = normalized_result(json);
    VolcengineDiagnosticSnapshot {
        server_audio_duration_ms: json
            .get("audio_info")
            .and_then(|v| v.get("duration"))
            .and_then(|v| v.as_u64()),
        server_log_id: result
            .and_then(|r| r.get("additions"))
            .and_then(|v| v.get("log_id"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        ..Default::default()
    }
}
```

Add method:

```rust
pub fn diagnostic_snapshot(&self) -> VolcengineDiagnosticSnapshot {
    let st = self.state.lock();
    VolcengineDiagnosticSnapshot {
        server_audio_duration_ms: st.last_server_audio_duration_ms,
        server_log_id: st.last_server_log_id.clone(),
        socket_error: st.last_socket_error.clone(),
        frames_sent: Some(st.frames_sent as u64),
        bytes_sent: Some(st.bytes_sent as u64),
        pending_sends: Some(self.pending_sends.load(Ordering::SeqCst) as u64),
        final_missing_partial_used: st.final_missing_partial_used,
    }
}
```

- [ ] **Step 4: Update Volcengine state during server messages and errors**

Inside `handle_frame`, after parsing JSON:

```rust
let facts = diagnostic_facts_from_server_json(&json);
{
    let mut st = self.state.lock();
    if facts.server_audio_duration_ms.is_some() {
        st.last_server_audio_duration_ms = facts.server_audio_duration_ms;
    }
    if facts.server_log_id.is_some() {
        st.last_server_log_id = facts.server_log_id;
    }
}
```

In receive loop error branch:

```rust
this.state.lock().last_socket_error = Some(e.to_string());
```

In `fallback_to_partial_or_error`, before `signal_success` with partial:

```rust
self.state.lock().final_missing_partial_used = true;
```

- [ ] **Step 5: Copy Volcengine facts into dictation trace**

In `ActiveAsr::Volcengine(v)` end-session branch, after final or partial result is obtained and before returning `r`, capture:

```rust
let asr_diag = v.diagnostic_snapshot();
```

Because the current branch returns directly from `match`, store the snapshot in a local `Option<VolcengineDiagnosticSnapshot>` outside the match:

```rust
let mut volcengine_diag = None;
```

Before leaving the Volcengine branch:

```rust
volcengine_diag = Some(v.diagnostic_snapshot());
```

After raw transcript is non-empty and diagnostic trace exists:

```rust
if let Some(snapshot) = volcengine_diag {
    diagnostic_trace.asr.server_audio_duration_ms = snapshot.server_audio_duration_ms;
    diagnostic_trace.asr.server_log_id = snapshot.server_log_id;
    diagnostic_trace.asr.socket_error = snapshot.socket_error;
    diagnostic_trace.asr.frames_sent = snapshot.frames_sent;
    diagnostic_trace.asr.bytes_sent = snapshot.bytes_sent;
    diagnostic_trace.asr.pending_sends = snapshot.pending_sends;
    diagnostic_trace.asr.final_missing_partial_used = snapshot.final_missing_partial_used;
}
```

- [ ] **Step 6: Run Volcengine tests**

Run:

```powershell
cargo test diagnostic_facts_extract_log_id_and_audio_duration diagnostic_snapshot_reports_send_counters --lib
```

Expected: tests pass.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src-tauri/src/asr/volcengine.rs src-tauri/src/coordinator/dictation.rs
git commit -m "feat: capture doubao asr diagnostics"
```

---

### Task 5: Frontend Export Action

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/i18n/zh-CN.ts`
- Modify: `src/i18n/en.ts`
- Optionally modify: `src/i18n/zh-TW.ts`, `src/i18n/ja.ts`, `src/i18n/ko.ts`

- [ ] **Step 1: Add IPC wrapper**

In `src/lib/ipc.ts`, add near `exportErrorLog`:

```ts
export async function exportDiagnosticBundle(suggestedFileName: string): Promise<string | null> {
  if (!isTauri) {
    return `~/Downloads/${suggestedFileName}`;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const target = await save({
    defaultPath: suggestedFileName,
    filters: [{ name: 'Diagnostic Bundle', extensions: ['json'] }],
  });
  if (!target) return null;
  await invokeOrMock<void>(
    'export_diagnostic_bundle',
    { targetPath: target, recentLimit: 50 },
    () => undefined,
  );
  return target;
}
```

- [ ] **Step 2: Wire Settings import and handler**

In `src/pages/Settings.tsx`, add to IPC imports:

```ts
exportDiagnosticBundle,
```

Inside `PrivacySection`, add handler:

```ts
const onExportDiagnosticBundle = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  void runAction(
    'exportDiagnosticBundle',
    () => exportDiagnosticBundle(`whisper-input-diagnostics-${stamp}.json`),
    t('settings.privacy.diagnosticExportDone'),
  );
};
```

Add a `SettingRow` after the history toggle:

```tsx
<SettingRow
  label={t('settings.privacy.exportDiagnosticsLabel')}
  desc={t('settings.privacy.exportDiagnosticsDesc')}
>
  <Btn
    size="sm"
    variant="ghost"
    onClick={onExportDiagnosticBundle}
    disabled={isBusy('exportDiagnosticBundle')}
  >
    {isBusy('exportDiagnosticBundle')
      ? t('common.saving')
      : t('settings.privacy.exportDiagnosticsBtn')}
  </Btn>
</SettingRow>
```

- [ ] **Step 3: Add i18n strings**

In `src/i18n/zh-CN.ts`, under `settings.privacy`:

```ts
exportDiagnosticsLabel: '导出诊断包',
exportDiagnosticsDesc: '导出最近诊断记录、历史文本和日志片段，不包含 API Key。',
exportDiagnosticsBtn: '导出诊断包',
diagnosticExportDone: '诊断包已导出',
```

In `src/i18n/en.ts`, under `settings.privacy`:

```ts
exportDiagnosticsLabel: 'Export diagnostic bundle',
exportDiagnosticsDesc: 'Export recent diagnostic traces, history text, and log excerpts. API keys are excluded.',
exportDiagnosticsBtn: 'Export diagnostics',
diagnosticExportDone: 'Diagnostic bundle exported',
```

For `zh-TW`, `ja`, and `ko`, either add native strings or mirror the English strings so type compatibility remains intact.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/lib/ipc.ts src/pages/Settings.tsx src/i18n/zh-CN.ts src/i18n/en.ts src/i18n/zh-TW.ts src/i18n/ja.ts src/i18n/ko.ts
git commit -m "feat: add diagnostic bundle export UI"
```

---

### Task 6: End-To-End Verification

**Files:**
- No planned source changes unless tests expose a defect.

- [ ] **Step 1: Run backend tests**

```powershell
cargo test --lib
```

Expected: all existing and new backend tests pass.

- [ ] **Step 2: Run frontend build**

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Run Rust compile check**

```powershell
cargo check
```

Expected: compile succeeds. Existing warnings are acceptable if they predate this work.

- [ ] **Step 4: Manual diagnostic smoke test**

Run the app normally. Perform one short dictation. Export a diagnostic bundle from Settings.

Expected exported JSON facts:

```json
{
  "diagnostics": [
    {
      "traceId": "...",
      "asr": {
        "provider": "...",
        "rawText": "..."
      },
      "llm": {
        "finalText": "..."
      },
      "insertion": {
        "status": "Inserted"
      }
    }
  ],
  "history": [],
  "logExcerpt": "...",
  "settingsSummary": {
    "activeAsrProvider": "...",
    "activeLlmProvider": "..."
  },
  "environment": {
    "version": "..."
  }
}
```

Confirm the exported JSON does not contain:

```text
apiKey
accessToken
Authorization
Bearer
sk-
```

- [ ] **Step 5: Commit verification-only fixes if needed**

If Task 6 exposes a defect and a fix is needed:

```powershell
git add <changed-files>
git commit -m "fix: stabilize diagnostic export"
```

If no changes are needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: the plan covers structured traces, export bundle, privacy/redaction, retention, Doubao ASR facts, frontend export, and tests.
- Scope control: the plan does not implement ASR reconnect, long-audio segmentation, audio persistence, or insertion behavior changes.
- Type consistency: `DiagnosticTrace`, `DiagnosticStore`, `DiagnosticBundle`, `DiagnosticAsr`, and `export_diagnostic_bundle` names are used consistently across tasks.
- Risk note: Task 3 must preserve the single shared `DiagnosticStore` instance created in `run()` and passed both to Coordinator and Tauri state.
