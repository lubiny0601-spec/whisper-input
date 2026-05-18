import { buildOverviewMetrics } from './overviewMetrics';
import type { DictationSession } from './types';

function assertEqual<T>(actual: T, expected: T, name: string) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function session(partial: Partial<DictationSession>): DictationSession {
  return {
    id: partial.id ?? 'session',
    createdAt: partial.createdAt ?? '2026-05-15T09:00:00.000Z',
    rawTranscript: partial.rawTranscript ?? '',
    finalText: partial.finalText ?? '',
    mode: partial.mode ?? 'structured',
    appBundleId: partial.appBundleId ?? null,
    appName: partial.appName ?? null,
    insertStatus: partial.insertStatus ?? 'inserted',
    errorCode: partial.errorCode ?? null,
    durationMs: partial.durationMs ?? null,
    dictionaryEntryCount: partial.dictionaryEntryCount ?? null,
    asrProviderId: partial.asrProviderId ?? null,
    llmProviderId: partial.llmProviderId ?? null,
  };
}

function localIso(year: number, month: number, day: number, hour: number, minute = 0, second = 0, ms = 0): string {
  return new Date(year, month - 1, day, hour, minute, second, ms).toISOString();
}

const metrics = buildOverviewMetrics(
  [
    session({
      id: 'today-1',
      createdAt: localIso(2026, 5, 15, 0),
      finalText: 'hello',
      durationMs: 1200,
    }),
    session({
      id: 'today-2',
      createdAt: localIso(2026, 5, 15, 12, 30),
      finalText: '世界',
      durationMs: null,
    }),
    session({
      id: 'yesterday',
      createdAt: localIso(2026, 5, 14, 23, 59, 59, 999),
      finalText: 'older text',
      durationMs: 3000,
    }),
  ],
  new Date(2026, 4, 15, 16),
);

assertEqual(metrics.charsToday, 7, 'counts only today finalText characters');
assertEqual(metrics.segmentsToday, 2, 'counts only today sessions');
assertEqual(metrics.totalChars, 17, 'sums all history finalText characters');
assertEqual(metrics.totalDurationMs, 4200, 'sums all history duration with null as zero');
assertEqual(metrics.avgLatencyMs, 600, 'averages today durations with null as zero');

const emptyMetrics = buildOverviewMetrics([], new Date(2026, 4, 15, 16));
assertEqual(emptyMetrics.avgLatencyMs, 0, 'empty history average is zero');
