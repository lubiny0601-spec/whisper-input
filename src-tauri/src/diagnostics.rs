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
        if let (Some(socket_ms), Some(local_ms)) = (
            self.asr.socket_closed_at_ms,
            self.recorder.estimated_duration_ms,
        ) {
            if local_ms > socket_ms.saturating_add(500) {
                flags.push("local_audio_continued_after_asr_disconnect".to_string());
            }
        }
        if let (Some(server_ms), Some(local_ms)) = (
            self.asr.server_audio_duration_ms,
            self.recorder.estimated_duration_ms,
        ) {
            if server_ms.saturating_add(1000) < local_ms {
                flags.push("server_audio_duration_shorter_than_local_recording".to_string());
            }
        }
        if self.asr.final_missing_partial_used {
            flags.push("asr_final_missing_partial_used".to_string());
        }
        if let (Some(raw_chars), Some(final_chars)) = (self.asr.raw_chars, self.llm.final_chars) {
            if final_chars.saturating_mul(100) < raw_chars.saturating_mul(60) {
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
                "arch": std::env::consts::ARCH,
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
                .map(|created_at| created_at.with_timezone(&Utc) >= cutoff)
                .unwrap_or(true)
        });
        traces.truncate(DIAGNOSTIC_CAP.min(traces.len()));

        self.write_all_locked(&traces)
    }

    pub fn list_recent(&self, limit: usize) -> Result<Vec<DiagnosticTrace>> {
        let _guard = self.inner.lock.lock();
        let mut traces = self.read_all_locked()?;
        traces.truncate(limit.min(traces.len()));
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
                serde_json::to_writer(&mut file, trace)
                    .context("encode diagnostic trace failed")?;
                file.write_all(b"\n")
                    .context("write diagnostic newline failed")?;
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

        assert!(trace
            .flags
            .contains(&"asr_connection_reset_before_hotkey_release".to_string()));
        assert!(trace
            .flags
            .contains(&"local_audio_continued_after_asr_disconnect".to_string()));
        assert!(trace
            .flags
            .contains(&"server_audio_duration_shorter_than_local_recording".to_string()));
        assert!(trace
            .flags
            .contains(&"asr_final_missing_partial_used".to_string()));
        assert!(trace
            .flags
            .contains(&"llm_output_much_shorter_than_raw".to_string()));
        assert!(trace
            .flags
            .contains(&"insert_unverified_paste_sent".to_string()));
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
            store
                .append_with_now(
                    trace,
                    chrono::DateTime::parse_from_rfc3339("2026-05-21T00:00:00Z")
                        .unwrap()
                        .with_timezone(&chrono::Utc),
                )
                .unwrap();
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
