# Diagnostic Observability Design

## Purpose

Whisper Input needs enough local evidence to analyze failures before proposing fixes. Recent ASR disconnect investigation showed that plain logs and history are not enough to distinguish provider limits, network resets, client send bugs, LLM compression, and insertion failures.

This feature adds structured, privacy-aware diagnostics for each dictation session and a one-click diagnostic bundle export.

## Principles

- Do not infer root cause without evidence.
- Record facts at component boundaries: hotkey, recorder, ASR, LLM, insertion, history.
- Correlate all events for one dictation with a stable `traceId`.
- Export raw/final transcript text because the user explicitly allows it.
- Never export API keys, access tokens, credential files, or full provider secrets.
- Do not save microphone audio in the first version.
- Keep diagnostics local unless the user explicitly exports a bundle.

## Scope

### In Scope

- Structured JSONL diagnostic trace file.
- One trace per dictation session.
- ASR lifecycle metrics and socket close/error context.
- LLM and insertion result metadata.
- Raw transcript and final output text in trace and exported bundle.
- Frontend command to export a diagnostic bundle.
- Basic retention to prevent unbounded growth.

### Out of Scope

- Recording or exporting audio.
- Automatic upload.
- Provider-specific root-cause classification beyond evidence-backed flags.
- Full diagnostic dashboard UI.
- Fixing ASR reconnect or long-dictation behavior.

## Data Model

Diagnostics are stored as JSONL records. Each record is a complete trace snapshot for one session, written at session completion or terminal failure.

Recommended path:

`%APPDATA%/Qingyu Input/diagnostics.jsonl`

Each trace contains:

```json
{
  "schemaVersion": 1,
  "traceId": "20260521-012345-abcd",
  "createdAt": "2026-05-21T01:23:45.000Z",
  "app": {
    "version": "1.3.3",
    "platform": "windows"
  },
  "session": {
    "mode": "Light",
    "hotkeyMode": "Hold",
    "frontApp": "Google Chrome",
    "pressedAt": "2026-05-21T01:23:45.000Z",
    "releasedAt": "2026-05-21T01:24:18.000Z",
    "cancelled": false
  },
  "recorder": {
    "deviceName": "Microphone",
    "inputSampleRate": 48000,
    "outputSampleRate": 16000,
    "pcmBytes": 1056000,
    "estimatedDurationMs": 33000,
    "lastRms": 0.007,
    "peakRms": 0.058
  },
  "asr": {
    "provider": "doubao-streaming-asr-2",
    "connectedAtMs": 1850,
    "firstServerMessageAtMs": 2310,
    "lastServerMessageAtMs": 8600,
    "serverAudioDurationMs": 8600,
    "socketClosedAtMs": 28595,
    "socketError": "WSAECONNRESET 10054",
    "serverLogId": "202605210158088D7BA12160111239CBDF",
    "rawText": "recognized text",
    "rawChars": 37
  },
  "llm": {
    "provider": "gemini",
    "mode": "Light",
    "shortInputBypass": false,
    "streamingInsertEligible": true,
    "startedAtMs": 29200,
    "finishedAtMs": 32900,
    "error": null,
    "finalText": "final text",
    "finalChars": 37
  },
  "insertion": {
    "status": "Inserted",
    "method": "streaming-unicode",
    "focusRestored": true
  },
  "flags": [
    "asr_connection_reset_before_hotkey_release",
    "local_audio_continued_after_asr_disconnect",
    "server_audio_duration_shorter_than_local_recording"
  ]
}
```

## Evidence Flags

Flags are factual observations, not final root-cause conclusions.

Initial flags:

- `asr_connection_reset_before_hotkey_release`: ASR socket error occurred before the user released the hotkey.
- `local_audio_continued_after_asr_disconnect`: recorder continued receiving non-empty PCM after ASR disconnected.
- `server_audio_duration_shorter_than_local_recording`: provider-reported audio duration is materially shorter than local recorded duration.
- `asr_final_missing_partial_used`: ASR final result was missing and partial text was used.
- `llm_output_much_shorter_than_raw`: final output chars are less than 60% of raw chars for non-short input.
- `insert_unverified_paste_sent`: insertion status is `PasteSent`, not confirmed `Inserted`.
- `focus_not_ready_for_paste`: original insertion target could not be restored.

## Architecture

### Backend Module

Add `src-tauri/src/diagnostics.rs`.

Responsibilities:

- Own `DiagnosticTrace` structs.
- Provide a thread-safe `DiagnosticRecorder`.
- Append traces to JSONL atomically.
- Apply retention.
- Redact sensitive fields.
- Build diagnostic bundle payloads.

### Coordinator Integration

The coordinator owns the trace for a dictation session.

Required capture points:

- Session start: trace id, hotkey mode, polish mode, provider ids, front app.
- Recorder start and stop: device, format, PCM bytes, estimated duration.
- ASR session: connected time, server message times, server audio duration, server log id, socket errors.
- LLM dispatch: provider, model class where safe, bypass/streaming eligibility, duration, error.
- Insertion: focus restore result, insert method, insert status.
- History append: history id and error code.

### ASR Provider Instrumentation

ASR implementations should expose lightweight diagnostic callbacks or event structs rather than writing provider-specific trace logic into the coordinator.

For Doubao/Volcengine, capture:

- `connectId`
- response header log id if available
- JSON `result.additions.log_id`
- last `audio_info.duration`
- socket close frame if present
- tungstenite error string and OS error code if present
- bytes/frames sent counters at failure

### Export Command

Add Tauri command:

`export_diagnostic_bundle(targetPath: string, recentLimit?: number) -> Result<()>`

The bundle should be JSON in v1, not zip, to keep implementation simple and reviewable.

Contents:

- `diagnostics`: last N traces.
- `history`: last N history entries.
- `logExcerpt`: relevant recent `openless.log` tail.
- `settingsSummary`: provider ids, polish mode, hotkey mode, streaming insert, retention settings.
- `environment`: app version, OS, arch.

Do not include credential values.

### Frontend

Add a button under Settings:

- Label: `导出诊断包`
- Description: `包含最近诊断记录、历史文本和日志片段，不包含 API Key。`

Use existing dialog and IPC patterns similar to `exportErrorLog`.

## Retention

Default retention:

- Keep latest 200 diagnostic traces.
- Also drop traces older than 7 days when appending a new trace.

The file is small because it stores text and metadata only. No audio is stored.

## Privacy

Allowed:

- Raw transcript text.
- Final output text.
- Front app title.
- Provider ids and model ids.
- Error messages and timing.

Forbidden:

- API keys.
- Access tokens.
- Credential files.
- Full request Authorization headers.
- Clipboard contents unrelated to dictation.
- Audio files or raw PCM.

## Testing

Unit tests:

- Trace serialization remains backward-compatible for missing optional fields.
- Redaction removes credential-like values from settings summary.
- Evidence flags are generated only from factual field comparisons.
- Retention caps count and age.
- Export bundle contains diagnostics, history, log excerpt, and environment sections.

Integration tests or focused backend tests:

- Simulated ASR reset before hotkey release produces the expected evidence flags.
- `PasteSent` insertion produces `insert_unverified_paste_sent`.
- LLM output compression flag triggers only when raw/final ratio crosses threshold.

Frontend tests:

- IPC wrapper calls `export_diagnostic_bundle`.
- Settings page exposes the export action without exposing secrets.

## Rollout

1. Add backend data types and JSONL persistence.
2. Add coordinator trace capture for dictation only.
3. Add ASR diagnostic hooks for Doubao/Volcengine.
4. Add export command.
5. Add settings button.
6. Verify with an induced ASR disconnect or mocked ASR error path.

## Non-Goals For First Release

- Do not introduce automatic ASR reconnect.
- Do not introduce long-audio segmentation.
- Do not infer provider root cause from a single socket reset.
- Do not change insertion behavior.

## Acceptance Criteria

- After any dictation session, a trace exists with the same high-level facts visible in history plus component timing.
- For an ASR disconnect before hotkey release, the exported trace clearly shows local recording continued after ASR stopped receiving server messages.
- A diagnostic bundle can be exported from Settings.
- The bundle includes raw/final text and excludes credentials.
- Existing history and log export behavior remain unchanged.
- Automated tests cover serialization, redaction, retention, evidence flags, and export shape.
