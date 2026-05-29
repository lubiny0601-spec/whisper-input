import { ASR_PROVIDER_PRESETS, LLM_MODEL_PRESETS } from './providerPresets';
import {
  DOUBAO_ASR_PROVIDER_ID,
  GEMINI_PROVIDER_ID,
  QWEN_LLM_PROVIDER_ID,
  QWEN_REALTIME_ASR_PROVIDER_ID,
} from './product';
import { zhCN } from '../i18n/zh-CN';

function assertEqual(actual: string, expected: string, name: string) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const qwenAsrPreset = ASR_PROVIDER_PRESETS.find(
  (preset) => preset.id === QWEN_REALTIME_ASR_PROVIDER_ID,
);
const doubaoAsrPreset = ASR_PROVIDER_PRESETS.find(
  (preset) => preset.id === DOUBAO_ASR_PROVIDER_ID,
);
const qwenLlmPreset = LLM_MODEL_PRESETS.find(
  (preset) => preset.providerId === QWEN_LLM_PROVIDER_ID,
);
const qwenFlashPreset = LLM_MODEL_PRESETS.find(
  (preset) => preset.providerId === QWEN_LLM_PROVIDER_ID && preset.model === 'qwen3.5-flash',
);
const qwenPlusPreset = LLM_MODEL_PRESETS.find(
  (preset) => preset.providerId === QWEN_LLM_PROVIDER_ID && String(preset.model) === 'qwen3.6-plus',
);
const geminiLlmPreset = LLM_MODEL_PRESETS.find(
  (preset) => preset.providerId === GEMINI_PROVIDER_ID,
);
const geminiFlashLite = LLM_MODEL_PRESETS.find(
  p => p.providerId === GEMINI_PROVIDER_ID && p.model === 'gemini-3.1-flash-lite',
);
const qwenApiKeyUrl = 'https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=api#/api';
const doubaoAsrApiKeyUrl = 'https://console.volcengine.com/speech/app';
const geminiApiKeyUrl = 'https://aistudio.google.com/apikey';

assert(Boolean(qwenAsrPreset), 'qwen ASR preset should exist');
assert(Boolean(doubaoAsrPreset), 'doubao ASR preset should exist');
assert(Boolean(qwenLlmPreset), 'qwen LLM preset should exist');
assert(
  qwenLlmPreset?.model === 'qwen3.5-flash',
  `default Qwen LLM preset should be qwen3.5-flash, got ${qwenLlmPreset?.model}`,
);
if (!qwenFlashPreset) throw new Error('Qwen Flash should use the fast low-cost model qwen3.5-flash');
assert(!qwenPlusPreset, 'Qwen Plus should not be exposed because it misses the 3s latency budget');
assert(Boolean(geminiLlmPreset), 'gemini LLM preset should exist');
if (!geminiFlashLite) throw new Error('Gemini 3.1 Flash-Lite preset must exist');
assert(
  !LLM_MODEL_PRESETS.some(p => String(p.providerId) === 'doubao-llm'),
  'Doubao LLM should not be exposed because smoke tests exceed the 3s latency budget',
);

assert(
  qwenAsrPreset?.apiKeyLinkKey === 'settings.providers.getQwenApiKey',
  `qwen ASR API key label should be service-specific, got ${qwenAsrPreset?.apiKeyLinkKey}`,
);

assert(
  doubaoAsrPreset?.apiKeyLinkKey === 'settings.providers.getDoubaoApiKey',
  `doubao ASR API key label should be service-specific, got ${doubaoAsrPreset?.apiKeyLinkKey}`,
);

assert(
  qwenLlmPreset?.apiKeyLinkKey === 'settings.providers.getQwenApiKey',
  `qwen LLM API key label should be service-specific, got ${qwenLlmPreset?.apiKeyLinkKey}`,
);

assertEqual(
  qwenFlashPreset.labelKey,
  'settings.providers.presets.qwenFlash',
  'Qwen Flash label key',
);

assert(
  zhCN.settings.providers.presets.qwenFlash.includes('qwen3.5-flash'),
  `Qwen Flash label should show qwen3.5-flash, got ${zhCN.settings.providers.presets.qwenFlash}`,
);

assert(
  qwenLlmPreset?.apiKeyAccount === qwenAsrPreset?.apiKeyAccount,
  'qwen simple bundle should share one Bailian API key account across ASR and LLM',
);

assertEqual(qwenAsrPreset?.apiKeyUrl ?? '', qwenApiKeyUrl, 'Qwen ASR API Key direct URL');
assertEqual(qwenLlmPreset?.apiKeyUrl ?? '', qwenApiKeyUrl, 'Qwen LLM API Key direct URL');
assertEqual(doubaoAsrPreset?.apiKeyUrl ?? '', doubaoAsrApiKeyUrl, 'Doubao ASR API Key direct URL');

assert(
  geminiLlmPreset?.apiKeyLinkKey === 'settings.providers.getGeminiApiKey',
  `gemini LLM API key label should be service-specific, got ${geminiLlmPreset?.apiKeyLinkKey}`,
);

assertEqual(
  geminiFlashLite.apiKeyLinkKey,
  'settings.providers.getGeminiApiKey',
  'Gemini 3.1 Flash-Lite API Key 文案',
);

assertEqual(geminiFlashLite.apiKeyUrl, geminiApiKeyUrl, 'Gemini API Key direct URL');

assertEqual(
  geminiFlashLite.labelKey,
  'settings.providers.presets.gemini31FlashLite',
  'Gemini 3.1 Flash-Lite label key',
);

assert(
  qwenAsrPreset?.apiKeyUrl !== doubaoAsrPreset?.apiKeyUrl,
  'qwen ASR and doubao ASR should use distinct API key URLs',
);

assert(
  qwenLlmPreset?.apiKeyUrl !== geminiLlmPreset?.apiKeyUrl,
  'qwen LLM and gemini LLM should use distinct API key URLs',
);
