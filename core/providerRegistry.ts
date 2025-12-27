import OpenAIProvider from './models/openai/openaiProvider';
import ClaudeProvider from './models/claude/claudeProvider';
import DeepSeekProvider from './models/deepseek/deepseekProvider';
import GroqProvider from './models/groq/groqProvider';
import GrokProvider from './models/grok/grokProvider';
import GeminiProvider from './models/gemini/geminiProvider';
import LlamaProvider from './models/llama/llamaProvider';
import MistralProvider from './models/mistral/mistralProvider';
import QwenProvider from './models/qwen/qwenProvider';

type ProviderFactory = () => any;

const FACTORIES: Record<string, ProviderFactory> = {
  openai: () => new OpenAIProvider(),
  claude: () => new ClaudeProvider(),
  deepseek: () => new DeepSeekProvider(),
  groq: () => new GroqProvider(),
  grok: () => new GrokProvider(),
  gemini: () => new GeminiProvider(),
  llama: () => new LlamaProvider(),
  mistral: () => new MistralProvider(),
  qwen: () => new QwenProvider()
};

function normalize(name?: string): string | undefined {
  if (!name) return undefined;
  return String(name).trim().toLowerCase();
}

export function getKnownProviders(): string[] {
  return Object.keys(FACTORIES);
}

export function isKnownProvider(name?: string): boolean {
  const n = normalize(name);
  return !!n && !!FACTORIES[n];
}

export function createProvider(name?: string): any | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  const factory = FACTORIES[n];
  if (!factory) return undefined;
  try {
    return factory();
  } catch (err) {
    // If provider construction fails, return undefined (caller will handle)
    return undefined;
  }
}

export function filterKnownProviders(names: string[] | undefined): string[] {
  if (!names || names.length === 0) return getKnownProviders();
  return names.map((n) => normalize(n)).filter((n): n is string => !!n && !!FACTORIES[n]);
}

export default {
  getKnownProviders,
  isKnownProvider,
  createProvider,
  filterKnownProviders
};
