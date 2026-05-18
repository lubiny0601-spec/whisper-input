import type { DictationSession } from './types';

export interface OverviewMetrics {
  charsToday: number;
  segmentsToday: number;
  totalChars: number;
  totalDurationMs: number;
  avgLatencyMs: number;
}

export function buildOverviewMetrics(
  history: DictationSession[],
  referenceDate = new Date(),
): OverviewMetrics {
  const todayStart = new Date(referenceDate);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);

  let charsToday = 0;
  let segmentsToday = 0;
  let todayDurationMs = 0;
  let totalChars = 0;
  let totalDurationMs = 0;

  for (const session of history) {
    const finalTextLength = session.finalText.length;
    const durationMs = session.durationMs ?? 0;
    const createdAt = new Date(session.createdAt);
    const isToday =
      !Number.isNaN(createdAt.getTime()) &&
      createdAt >= todayStart &&
      createdAt < tomorrowStart;

    totalChars += finalTextLength;
    totalDurationMs += durationMs;

    if (isToday) {
      charsToday += finalTextLength;
      segmentsToday += 1;
      todayDurationMs += durationMs;
    }
  }

  return {
    charsToday,
    segmentsToday,
    totalChars,
    totalDurationMs,
    avgLatencyMs: segmentsToday > 0 ? todayDurationMs / segmentsToday : 0,
  };
}
