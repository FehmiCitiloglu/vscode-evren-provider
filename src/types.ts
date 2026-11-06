export interface EvrenModelInfo {
  id: string;
  name: string;
  family: string;
  contextWindow: number;
  maxOutputTokens: number;
  toolCalling: boolean;
  vision: boolean;
  thinking: boolean;
  supportsReasoningEffort?: string[];
}

export const DEFAULT_SERVER_URL = 'https://evren-llmapi.ssyz.org.tr/v1';

export const KNOWN_MODELS: Record<string, EvrenModelInfo> = {
  'mimo-v2.6-pro': {
    id: 'mimo-v2.6-pro',
    name: 'MiMo v2.6 Pro',
    family: 'mimo',
    contextWindow: 1048576,
    maxOutputTokens: 16384,
    toolCalling: true,
    vision: true,
    thinking: true,
    supportsReasoningEffort: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  },
  'deepseek-v4.1-flash': {
    id: 'deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    family: 'deepseek',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    toolCalling: true,
    vision: true,
    thinking: true,
  },
  'glm-5.3': {
    id: 'glm-5.3',
    name: 'GLM 5.3',
    family: 'glm',
    contextWindow: 524288,
    maxOutputTokens: 16384,
    toolCalling: true,
    vision: false,
    thinking: true,
  },
  'qwen3.8-flash-next': {
    id: 'qwen3.8-flash-next',
    name: 'Qwen 3.8 Flash Next',
    family: 'qwen',
    contextWindow: 262144,
    maxOutputTokens: 16384,
    toolCalling: true,
    vision: true,
    thinking: true,
  },
  'gemma-4-31b': {
    id: 'gemma-4-31b',
    name: 'Gemma 4 31B',
    family: 'gemma',
    contextWindow: 262144,
    maxOutputTokens: 16384,
    toolCalling: true,
    vision: true,
    thinking: true,
  },
  'qwen3-vl-30b': {
    id: 'qwen3-vl-30b',
    name: 'Qwen 3 VL 30B',
    family: 'qwen',
    contextWindow: 262144,
    maxOutputTokens: 16384,
    toolCalling: true,
    vision: true,
    thinking: false,
  },
};

export interface EvrenConfig {
  serverUrl: string;
  apiKey: string;
  enableThinking: boolean;
  reasoningEffort: string;
  enableToolCalling: boolean;
  maxOutputTokens: number;
  requestTimeout: number;
}
