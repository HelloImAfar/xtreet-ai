import type { IntentProfile } from '@/types/rex';
import type { Category } from '@/types';
import type { ModelProvider } from './models/provider';
import { getProvidersOrdered } from './config';

/* Providers */
import GeminiProvider from './models/gemini/geminiProvider';
import DeepSeekProvider from './models/deepseek/deepseekProvider';

/* ============================================================
   LLM Intent Classification (GEN 1 – Production)
   ============================================================ */

/**
 * Strict JSON schema expected from LLM
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

/* ------------------------------------------------------------------ */
/* SYSTEM PROMPT                                                      */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a strict intent classifier.

Your ONLY task is to analyze user input and return ONLY a valid JSON object.
Do NOT add explanations, markdown, comments, or extra text.

Return ONLY this exact JSON structure:

{
  "category": "<one of: fast, code, creative, informative, emotional, math, vision, branding, efficiency, current, other>",
  "confidence": <number between 0.0 and 1.0>,
  "entities": {
    "depth": "<shallow | medium | deep>",
    "complexity": "<low | medium | high>"
  },
  "risk": {
    "severity": "<low | medium | high>"
  }
}

Classification rules:
- fast: greetings, acknowledgements, glue messages
- code: programming, debugging, technical issues
- creative: writing, storytelling, artistic content
- informative: explanations, factual questions
- emotional: feelings, support, personal states
- math: calculations, proofs, equations
- vision: image analysis (not generation)
- branding: brand, marketing, identity
- efficiency: optimization, productivity
- current: news, time-sensitive topics
- other: anything else

Confidence:
- ≥0.8 clear
- 0.5–0.8 mixed
- ≤0.5 unclear

You MUST output ONLY valid JSON.`;

/* ------------------------------------------------------------------ */
/* PROVIDER SELECTION                                                 */
/* ------------------------------------------------------------------ */

/**
 * Explicit provider priority for intent classification
 * (quality / price / latency optimized)
 */
function getIntentProviders(): ModelProvider[] {
  const enabled = getProvidersOrdered()
    .filter((p) => p.enabled)
    .map((p) => p.name);

  const providers: ModelProvider[] = [];

  if (enabled.includes('gemini')) {
    providers.push(new GeminiProvider());
  }

  if (enabled.includes('deepseek')) {
    providers.push(new DeepSeekProvider());
  }

  return providers;
}

/* ------------------------------------------------------------------ */
/* HELPERS                                                            */
/* ------------------------------------------------------------------ */

function parseIntentJson(response: string): LLMIntentOutput | null {
  try {
    const cleaned = response
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned) as LLMIntentOutput;

    if (!parsed.category || typeof parsed.confidence !== 'number') {
      return null;
    }

    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

    return parsed;
  } catch {
    return null;
  }
}

function fallbackProfile(): IntentProfile {
  return {
    intent: 'unknown',
    category: 'other',
    confidence: 0.0,
    entities: { depth: 'shallow', complexity: 'low' },
    risk: { severity: 'low' }
  };
}

function toIntentProfile(out: LLMIntentOutput): IntentProfile {
  return {
    intent: `${out.category}_intent`,
    category: out.category,
    confidence: out.confidence,
    entities: {
      depth: out.entities?.depth ?? 'shallow',
      complexity: out.entities?.complexity ?? 'low'
    },
    risk: {
      severity: out.risk?.severity ?? 'low'
    }
  };
}

/* ------------------------------------------------------------------ */
/* MAIN API                                                           */
/* ------------------------------------------------------------------ */

export async function analyzeIntentWithLLM(
  text: string
): Promise<IntentProfile> {
  if (!text || typeof text !== 'string') {
    return fallbackProfile();
  }

  const providers = getIntentProviders();
  if (providers.length === 0) {
    return fallbackProfile();
  }

  for (const provider of providers) {
    // Retry same provider twice
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const prompt = `${SYSTEM_PROMPT}\n\nUser input: "${text}"`;

        const result = await provider.execute(prompt, {
          temperature: 0.2,
          maxTokens: 300
        });

        const parsed = parseIntentJson(result.text);
        if (parsed) {
          return toIntentProfile(parsed);
        }
      } catch {
        // silent retry
      }
    }
  }

  return fallbackProfile();
}

export default { analyzeIntentWithLLM };
