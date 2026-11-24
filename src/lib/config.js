export const CONFIG = {
  nominatim: 'https://nominatim.openstreetmap.org/search',
  stac: 'https://planetarycomputer.microsoft.com/api/stac/v1/search',
  data: 'https://planetarycomputer.microsoft.com/api/data/v1',
  collection: 'sentinel-2-l2a',
  worldcoverCollection: 'esa-worldcover',
  maxSpan: 0.8,
  searchSpacingMs: 1100,
  timeoutMs: 30000,
  rasterSize: 128,
  minTimelineYears: 3,
  maxTimelineYears: 5,
  minTrainingPixels: 80
};

export const SCL_INVALID_CLASSES = [0, 1, 2, 3, 7, 8, 9, 10, 11];

export const WORLDCOVER_LABEL_MAP = {
  10: 'vegetation',
  20: 'vegetation',
  30: 'vegetation',
  40: 'vegetation',
  50: 'built',
  60: 'bare',
  70: 'bare',
  80: 'water',
  90: 'water',
  95: 'vegetation',
  100: 'vegetation'
};

export const SEASONS = {
  'Feb 1 - Mar 31': ['02-01', '03-31'],
  'Jan 1 - Feb 28': ['01-01', '02-28'],
  'Oct 1 - Nov 30': ['10-01', '11-30']
};

export const SESSION_KEY = 'ecoWatchSession';
export const CHAT_SIZE_KEY = 'ecoWatchChatSize';

export const AI_SOURCES = [
  {
    name: 'Free.ai',
    url: 'https://api.free.ai/v1/chat/completions',
    model: 'qwen3-8b',
    cooldownUntil: 0
  },
  {
    name: 'Free.ai Mistral',
    url: 'https://api.free.ai/v1/chat/completions',
    model: 'mistral',
    cooldownUntil: 0
  },
  {
    name: 'LLM7.io',
    url: 'https://api.llm7.io/v1/chat/completions',
    model: 'mistral-Nemo-Instruct-2407',
    cooldownUntil: 0
  },
  {
    name: 'OVHcloud',
    url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
    model: 'Mistral-Small-3.2-24B-Instruct-2506',
    cooldownUntil: 0
  }
];
