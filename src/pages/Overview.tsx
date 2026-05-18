// Overview.tsx — 真实指标，从 listHistory + getCredentials 派生。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PreviewButton, PreviewCard, PreviewPageHeader, PreviewPill } from '../components/preview/PreviewPrimitives';
import { detectOS } from '../components/WindowChrome';
import { formatComboLabel } from '../lib/hotkey';
import { getCredentials, listHistory } from '../lib/ipc';
import { buildOverviewMetrics } from '../lib/overviewMetrics';
import {
  DEFAULT_ASR_PROVIDER_ID,
  DEFAULT_LLM_PROVIDER_ID,
  DOUBAO_ASR_PROVIDER_ID,
  DOUBAO_LLM_PROVIDER_ID,
  GEMINI_PROVIDER_ID,
  OPENAI_COMPATIBLE_PROVIDER_ID,
  QWEN_LLM_PROVIDER_ID,
  QWEN_REALTIME_ASR_PROVIDER_ID,
} from '../lib/product';
import type { CredentialsStatus, DictationSession, PolishMode } from '../lib/types';
import { useHotkeySettings } from '../state/HotkeySettingsContext';

function useModeLabels(): Record<PolishMode, string> {
  const { t } = useTranslation();
  return {
    raw: t('style.modes.raw.name'),
    light: t('style.modes.light.name'),
    structured: t('style.modes.structured.name'),
    formal: t('style.modes.formal.name'),
  };
}

interface OverviewProps {
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
}

const ASR_NAME_KEY_BY_ID: Record<string, string> = {
  [QWEN_REALTIME_ASR_PROVIDER_ID]: 'asrQwenRealtime',
  [DOUBAO_ASR_PROVIDER_ID]: 'asrDoubaoStreaming',
};

const LLM_NAME_KEY_BY_ID: Record<string, string> = {
  [QWEN_LLM_PROVIDER_ID]: 'qwenMax',
  [DOUBAO_LLM_PROVIDER_ID]: 'doubaoSeed20Lite',
  [OPENAI_COMPATIBLE_PROVIDER_ID]: 'openaiCompatible',
  [GEMINI_PROVIDER_ID]: 'gemini',
  ark: 'ark',
  deepseek: 'deepseek',
  siliconflow: 'siliconflow',
  openai: 'openai',
  codex_oauth: 'codexOAuth',
  mimo: 'mimo',
  cometapi: 'cometapi',
  openrouterFree: 'openrouterFree',
  alibabaCoding: 'alibabaCoding',
  codingPlanX: 'codingPlanX',
  custom: 'custom',
};

export function Overview({ onOpenHistory, onOpenSettings }: OverviewProps) {
  const { t } = useTranslation();
  const os = detectOS();
  const modeLabel = useModeLabels();
  const [history, setHistory] = useState<DictationSession[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [credsError, setCredsError] = useState(false);
  const [creds, setCreds] = useState<CredentialsStatus>({
    activeAsrProvider: DEFAULT_ASR_PROVIDER_ID,
    activeLlmProvider: DEFAULT_LLM_PROVIDER_ID,
    asrConfigured: false,
    llmConfigured: false,
    volcengineConfigured: false,
    arkConfigured: false,
  });
  const { prefs } = useHotkeySettings();

  const refreshHistory = useCallback(() => {
    setHistoryError(false);
    listHistory()
      .then(setHistory)
      .catch(error => {
        console.error('[overview] failed to load history', error);
        setHistoryError(true);
      });
  }, []);

  useEffect(() => {
    refreshHistory();
    getCredentials()
      .then(status => {
        setCreds(status);
        setCredsError(false);
      })
      .catch(error => {
        console.error('[overview] failed to load credentials status', error);
        setCredsError(true);
      });
  }, [refreshHistory]);

  const metrics = useMemo(() => buildOverviewMetrics(history), [history]);

  // 周历:过去 7 天每天的条数
  const weekly = useMemo(() => history.length, [history]);

  const asrProviderId = creds.activeAsrProvider || DEFAULT_ASR_PROVIDER_ID;
  const llmProviderId = creds.activeLlmProvider || DEFAULT_LLM_PROVIDER_ID;
  const asrNameKey = ASR_NAME_KEY_BY_ID[asrProviderId];
  const llmNameKey = LLM_NAME_KEY_BY_ID[llmProviderId];
  const asrProviderName = asrNameKey
    ? t(`settings.providers.presets.${asrNameKey}`)
    : t('settings.providers.presets.asrQwenRealtime');
  const asrProviderSubname =
    asrProviderId === QWEN_REALTIME_ASR_PROVIDER_ID
      ? 'Qwen realtime'
      : asrProviderId === DOUBAO_ASR_PROVIDER_ID
        ? 'Doubao backup'
        : 'Qwen realtime';
  const llmProviderName = llmNameKey
    ? t(`settings.providers.presets.${llmNameKey}`)
    : llmProviderId;
  const asrLogoSrc =
    asrProviderId === DOUBAO_ASR_PROVIDER_ID ? 'preview-doubao-logo.png' : 'preview-qwen-logo.png';
  const llmLogoSrc =
    llmProviderId === GEMINI_PROVIDER_ID
      ? 'preview-gemini-logo.png'
      : llmProviderId === DOUBAO_LLM_PROVIDER_ID
        ? 'preview-doubao-logo.png'
        : 'preview-qwen-logo.png';

  return (
    <>
      <PreviewPageHeader title={t('overview.title')} desc={t('overview.desc')} />

      <div className="wi-model-grid">
        <ProviderCard
          logoSrc={asrLogoSrc}
          kind={t('overview.asrKind')}
          name={asrProviderName}
          subname={asrProviderSubname}
          status={credsError ? 'error' : creds.asrConfigured ? 'configured' : 'notConfigured'}
          onOpenSettings={onOpenSettings}
        />
        <ProviderCard
          logoSrc={llmLogoSrc}
          kind={t('overview.llmKind')}
          name={llmProviderName}
          subname={llmProviderId}
          status={credsError ? 'error' : creds.llmConfigured ? 'configured' : 'notConfigured'}
          onOpenSettings={onOpenSettings}
        />
      </div>

      <div className="wi-metric-grid">
        <Metric iconLabel="T" label={t('overview.metricChars')} value={historyError ? '—' : metrics.charsToday.toLocaleString()} trend={historyError ? t('overview.historyLoadError') : t('overview.metricSegments', { count: metrics.segmentsToday })} />
        <Metric iconLabel="◷" label={t('overview.metricDuration')} value={historyError ? '—' : formatVoiceInputDuration(metrics.totalDurationMs, t)} trend={historyError ? t('overview.historyLoadError') : t('overview.metricTotalTrend')} accent />
        <Metric iconLabel="〽" label={t('overview.metricAvg')} value={historyError ? '—' : formatDuration(metrics.avgLatencyMs, t)} trend={historyError ? t('overview.historyLoadError') : metrics.segmentsToday > 0 ? t('overview.metricAvgTrend') : t('overview.metricNoData')} tone="purple" />
        <Metric iconLabel="▤" label={t('overview.metricTotal')} value={historyError ? '—' : metrics.totalChars.toLocaleString()} trend={historyError ? t('overview.historyLoadError') : t('overview.metricTotalTrend')} />
      </div>

      <div className="wi-overview-bottom">
        <PreviewCard className="wi-week-card">
          <div className="wi-overview-card-head">
            <span>{t('overview.weekTitle')}</span>
            <div className="wi-segment-mini">
              <span className="active">{t('overview.weekRange7')}</span>
              <span>{t('overview.weekRange30')}</span>
              <span>{t('overview.weekRangeAll')}</span>
            </div>
          </div>
          {historyError ? (
            <div className="wi-overview-empty">
              {t('overview.historyLoadError')}
            </div>
          ) : (
            <WeekChart hasData={weekly > 0} />
          )}
          <div className="wi-chart-note">
            {t('overview.weekNote')}
          </div>
        </PreviewCard>

        <PreviewCard className="wi-recent-card">
          <div className="wi-overview-card-head wi-recent-head">
            <span>{t('overview.recentTitle')}</span>
            <PreviewButton onClick={onOpenHistory}>{t('overview.recentAll')}</PreviewButton>
          </div>
          <div className="wi-scroll wi-recent-list">
            {historyError ? (
              <div className="wi-overview-empty wi-recent-empty">
                <span>{t('overview.recentLoadFailed')}</span>
                <PreviewButton onClick={refreshHistory}>{t('overview.historyRetry')}</PreviewButton>
              </div>
            ) : (
              <>
                {history.length === 0 && (
                  <div className="wi-overview-empty wi-recent-empty">
                    {t('overview.recentEmpty', { trigger: prefs ? formatComboLabel(prefs.dictationHotkey) : '' })}
                  </div>
                )}
                {history.slice(0, 5).map(s => (
                  <RecentRow key={s.id} session={s} modeLabel={modeLabel} os={os} />
                ))}
              </>
            )}
          </div>
        </PreviewCard>
      </div>
    </>
  );
}

interface ProviderCardProps {
  logoSrc: string;
  kind: string;
  name: string;
  subname: string;
  status: 'configured' | 'notConfigured' | 'error';
  onOpenSettings?: () => void;
}

function ProviderCard({ logoSrc, kind, name, subname, status, onOpenSettings }: ProviderCardProps) {
  const { t } = useTranslation();
  const isAsr = kind === t('overview.asrKind');
  return (
    <PreviewCard className={`wi-provider-card ${isAsr ? 'wi-provider-card-asr' : 'wi-provider-card-llm'}`}>
      <img className="wi-model-logo" src={logoSrc} alt="" />
      <div className="wi-provider-main">
        <div className="wi-provider-meta">
          <span>{kind}</span>
          {status === 'configured' && (
            <PreviewPill tone="green">
              <span className="wi-status-dot" />
              {t('overview.statusConfigured')}
            </PreviewPill>
          )}
          {status === 'notConfigured' && (
            <PreviewPill>{t('overview.statusNotConfigured')}</PreviewPill>
          )}
          {status === 'error' && (
            <PreviewPill className="wi-pill-error">{t('overview.statusUnknown')}</PreviewPill>
          )}
        </div>
        <div className="wi-provider-name">{name}</div>
        <div className={`wi-provider-subname ${status === 'error' ? 'wi-provider-subname-error' : ''}`}>
          {status === 'error' ? t('overview.credentialsLoadError') : subname}
        </div>
      </div>
      <div className="wi-provider-actions">
        <PreviewButton onClick={onOpenSettings}>{t('overview.changeModel')}</PreviewButton>
      </div>
    </PreviewCard>
  );
}

interface MetricProps {
  iconLabel: string;
  label: string;
  value: string;
  trend: string;
  accent?: boolean;
  tone?: 'blue' | 'purple';
}

function Metric({ iconLabel, label, value, trend, accent, tone = 'blue' }: MetricProps) {
  return (
    <PreviewCard className="wi-metric-card">
      <div className={`wi-metric-icon ${accent ? 'wi-metric-icon-accent' : ''} ${tone === 'purple' ? 'wi-metric-icon-purple' : ''}`}>
        {iconLabel}
      </div>
      <div className="wi-metric-copy">
        <span>{label}</span>
        <b className={accent ? 'wi-metric-accent' : undefined}>{value}</b>
        <small>{trend || '\u00a0'}</small>
      </div>
    </PreviewCard>
  );
}

function WeekChart({ hasData }: { hasData: boolean }) {
  return (
    <div className="wi-week-chart">
      <svg viewBox="0 0 650 260" width="100%" height="100%" aria-hidden="true">
        <defs>
          <linearGradient id="wi-area-trend" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#0f6fff" stopOpacity={hasData ? 0.2 : 0.1} />
            <stop offset="1" stopColor="#0f6fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="#e8eef6">
          <path d="M50 30H615M50 76H615M50 122H615M50 168H615M50 214H615" />
        </g>
        <path d="M62 182 C118 124,157 96,226 151 S337 139,407 70 S525 185,604 151 L604 230 L62 230Z" fill="url(#wi-area-trend)" />
        <path d="M62 182 C118 124,157 96,226 151 S337 139,407 70 S525 185,604 151" stroke="#0f6fff" strokeWidth="3" fill="none" opacity={hasData ? 1 : 0.58} />
      </svg>
    </div>
  );
}

function RecentRow({
  session,
  modeLabel,
  os,
}: {
  session: DictationSession;
  modeLabel: Record<PolishMode, string>;
  os: ReturnType<typeof detectOS>;
}) {
  const { t } = useTranslation();
  return (
    <div className="wi-recent-row">
      <div className="wi-recent-time">
        <span>
          {formatTime(session.createdAt)}
        </span>
        <PreviewPill>{modeLabel[session.mode]}</PreviewPill>
      </div>
      <div className="wi-recent-main">
        <div className="wi-recent-text wi-clamp-2">
          {session.finalText.split('\n')[0]}
        </div>
        <div className="wi-recent-tags">
          <PreviewPill>{providerSummary(session, t)}</PreviewPill>
          <PreviewPill tone={session.insertStatus === 'failed' ? 'orange' : 'green'}>
            {insertStatusLabel(session.insertStatus, t, os)}
          </PreviewPill>
        </div>
      </div>
      <span className="wi-recent-duration">
        {formatDuration(session.durationMs ?? 0, t)}
      </span>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDuration(ms: number, t: ReturnType<typeof useTranslation>['t']): string {
  if (ms <= 0) return '—';
  const sec = ms / 1000;
  if (sec < 60) return t('common.durationSeconds', { value: sec.toFixed(1) });
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function formatVoiceInputDuration(ms: number, t: ReturnType<typeof useTranslation>['t']): string {
  if (ms <= 0) return '—';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) {
    return t('common.durationMinutes', { value: Math.max(totalMinutes, 1) });
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return t('overview.metricVoiceInputHours', { hours, minutes });
}

function providerSummary(session: DictationSession, t: ReturnType<typeof useTranslation>['t']): string {
  const asr = session.asrProviderId ? asrProviderDisplayName(session.asrProviderId, t) : '—';
  const llm = session.llmProviderId ? llmProviderDisplayName(session.llmProviderId, t) : '—';
  return `${t('history.asrProvider', { provider: asr })} · ${t('history.llmProvider', { provider: llm })}`;
}

function asrProviderDisplayName(providerId: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (providerId === QWEN_REALTIME_ASR_PROVIDER_ID) return t('history.providerQwenRealtime');
  if (providerId === DOUBAO_ASR_PROVIDER_ID) return t('history.providerDoubaoStreaming');
  return t('history.providerQwenRealtime');
}

function llmProviderDisplayName(providerId: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (providerId === GEMINI_PROVIDER_ID) return t('history.providerGemini');
  if (providerId === OPENAI_COMPATIBLE_PROVIDER_ID) return t('history.providerOpenAICompatible');
  if (providerId === QWEN_LLM_PROVIDER_ID) return t('settings.providers.presets.qwenMax');
  if (providerId === DOUBAO_LLM_PROVIDER_ID) return t('settings.providers.presets.doubaoSeed20Lite');
  if (providerId === QWEN_REALTIME_ASR_PROVIDER_ID || providerId === DOUBAO_ASR_PROVIDER_ID || isLocalAsrProviderId(providerId)) {
    return t('settings.providers.presets.qwenMax');
  }
  return providerId;
}

function isLocalAsrProviderId(providerId: string): boolean {
  const normalized = providerId.toLowerCase();
  return normalized.includes('asr') || normalized.includes('sherpa') || normalized.includes('fired') || normalized.includes('firered') || normalized.includes('qingyu');
}

function insertStatusLabel(
  status: DictationSession['insertStatus'],
  t: ReturnType<typeof useTranslation>['t'],
  os: ReturnType<typeof detectOS>,
): string {
  if (status === 'inserted') return t('history.inserted');
  if (status === 'pasteSent') return t('history.pasteSent');
  if (status === 'copiedFallback') {
    return t('history.copiedFallback', { shortcut: os === 'mac' ? '⌘V' : 'Ctrl+V' });
  }
  return t('history.insertFailed');
}
