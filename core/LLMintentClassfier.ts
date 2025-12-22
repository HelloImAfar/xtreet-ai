import type { IntentProfile } from '@/types/rex';
import type { Category } from '@/types';
import type { ModelProvider } from './models/provider';
import { getProvidersOrdered } from './config';

/* Provider imports */
import OpenAIProvider from './models/openai/openaiProvider';
import ClaudeProvider from './models/claude/claudeProvider';
import DeepSeekProvider from './models/deepseek/deepseekProvider';
import GrokProvider from './models/grok/grokProvider';
import GeminiProvider from './models/gemini/geminiProvider';
import LlamaProvider from './models/llama/llamaProvider';
import MistralProvider from './models/mistral/mistralProvider';
import QwenProvider from './models/qwen/qwenProvider';
import GroqProvider from './models/groq/groqProvider';
import MockProvider from './models/mockProvider';

/* ============================================================
   Intent Classification via LLM
   ============================================================ */

/**
 * Strict JSON schema enforced in system prompt
 */
interface LLMIntentOutput {
  category: Category;
  confidence: number;
  entities?: {
    depth?: 'shallow' | 'medium' | 'deep';
    complexity?: 'low' | 'medium' | 'high';
  };
  risk?: {
    severity: 'low' | 'medium' | 'high';
  };
}

const SYSTEM_PROMPT = `You are a strict intent classifier. Your ONLY task is to analyze user input and return ONLY a valid JSON object. Do NOT add explanations, markdown, or any other text.

Return ONLY this exact JSON structure with NO additional content:
{
  "category": "<one of: fast, code, creative, informative, emotional, math, vision, branding, efficiency, current, other>",
  "confidence": <number between 0.0 and 1.0>,
  "entities": {
    "depth": "<one of: shallow, medium, deep>",
    "complexity": "<one of: low, medium, high>"
  },
  "risk": {
    "severity": "<one of: low, medium, high>"
  }
}

Classify based on:
- "fast": Simple greetings, acknowledgments (hi, ok, thanks)
- "code": Programming, debugging, technical issues
- "creative": Writing, storytelling, artistic content
- "informative": Explanations, educational, knowledge requests
- "emotional": Feelings, support, personal matters
- "math": Mathematical problems, calculations, proofs
- "vision": Image analysis, visual content (not generated)
- "branding": Marketing, brand strategy, identity
- "efficiency": Optimization, productivity, process improvement
- "current": Time-sensitive, news, current events
- "other": Anything else

Set confidence high (0.8+) if signals are clear, medium (0.5-0.8) if mixed, low (0.3-0.5) if unclear.
Set entities.depth: "shallow" for simple/short, "medium" for moderate, "deep" for complex multi-concept.
Set entities.complexity: "low" for straightforward, "medium" for moderate reasoning, "high" for advanced analysis.
Set risk.severity: "low" for safe, "medium" for potentially harmful, "high" for clearly harmful.

You MUST return ONLY valid JSON with NO markdown code blocks, NO explanations, NO line breaks before/after.`;

/**
 * Get the first available provider from config
 */
function getFirstAvailableProvider(): ModelProvider | null {
  const providers = getProvidersOrdered();

  const providerFactories: Record<string, () => ModelProvider> = {
    openai: () => new OpenAIProvider(),
    claude: () => new ClaudeProvider(),
    deepseek: () => new DeepSeekProvider(),
    grok: () => new GrokProvider(),
    gemini: () => new GeminiProvider(),
    llama: () => new LlamaProvider(),
    mistral: () => new MistralProvider(),
    qwen: () => new QwenProvider(),
    groq: () => new GroqProvider(),
    mock: () => new MockProvider()
  };

  for (const config of providers) {
    if (!config.enabled) continue;

    const factory = providerFactories[config.name];
    if (factory) {
      return factory();
    }
  }

  return null;
}

/**
 * Safely parse LLM response as JSON
 */
function parseIntentJson(response: string): LLMIntentOutput | null {
  try {
    // Strip whitespace and remove potential markdown code blocks
    const cleaned = response
      .trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned) as LLMIntentOutput;

    // Validate required fields
    if (!parsed.category || typeof parsed.confidence !== 'number') {
      return null;
    }

    // Clamp confidence to [0, 1]
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Build fallback IntentProfile when parsing fails
 */
function buildFallbackProfile(): IntentProfile {
  return {
    intent: 'unknown',
    category: 'other' as Category,
    confidence: 0.0,
    entities: {
      depth: 'shallow',
      complexity: 'low'
    },
    risk: {
      severity: 'low'
    }
  };
}

/**
 * Convert LLMIntentOutput to IntentProfile
 */
function toIntentProfile(output: LLMIntentOutput): IntentProfile {
  return {
    intent: `${output.category}_intent`,
    category: output.category,
    confidence: output.confidence,
    entities: {
      depth: output.entities?.depth ?? 'shallow',
      complexity: output.entities?.complexity ?? 'low'
    },
    risk: {
      severity: output.risk?.severity ?? 'low'
    }
  };
}

/**
 * Analyze user intent using an LLM (provider-agnostic)
 * @param text User input text to classify
 * @returns IntentProfile with category, confidence, entities, and risk
 */
export async function analyzeIntentWithLLM(text: string): Promise<IntentProfile> {
  if (!text || typeof text !== 'string') {
    return buildFallbackProfile();
  }

  const provider = getFirstAvailableProvider();
  if (!provider) {
    return buildFallbackProfile();
  }

  try {
    const userMessage = `Classify this text: "${text}"`;
    const combinedPrompt = `${SYSTEM_PROMPT}\n\nUser input: ${userMessage}`;

    const result = await provider.execute(combinedPrompt, {
      temperature: 0.3, // Low temperature for consistent, deterministic classification
      maxTokens: 300
    });

    const parsed = parseIntentJson(result.text);
    if (!parsed) {
      return buildFallbackProfile();
    }

    return toIntentProfile(parsed);
  } catch {
    return buildFallbackProfile();
  }
}

export default { analyzeIntentWithLLM };
