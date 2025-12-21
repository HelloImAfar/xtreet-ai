import logger from './logger';

export type Env = 'development' | 'production' | 'test' | string;

export interface FeatureFlags {
  multicore: boolean;
  sei: boolean;
  phantom: boolean;
  signalLayer: boolean;
  [key: string]: boolean;
}

export interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority?: number; // lower = higher priority
  meta?: {
    defaultModel?: string;
    defaultTemperature?: number;
    costPer1k?: number;
    latencyMs?: number;
    [key: string]: any;
  };
}

export interface RExConfig {
  env: Env;
  nodeEnv?: string;
  costLimitUsd?: number;
  tokenLimit?: number;
  defaultTimeoutMs: number;
  features: FeatureFlags;
  providers: ProviderConfig[];
}

/* -------------------------------------------------------------------------- */
/*                                   UTILS                                    */
/* -------------------------------------------------------------------------- */

function parseNumber(envVar?: string): number | undefined {
  if (!envVar) return undefined;
  const n = Number(envVar);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolean(envVar?: string): boolean {
  if (!envVar) return false;
  return ['1', 'true', 'yes', 'on'].includes(envVar.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/*                              FEATURE FLAGS                                 */
/* -------------------------------------------------------------------------- */

function parseFeatureFlags(): FeatureFlags {
  const flags: FeatureFlags = {
    multicore: parseBoolean(process.env.REX_FEATURE_MULTICORE),
    sei: parseBoolean(process.env.REX_FEATURE_SEI),
    phantom: parseBoolean(process.env.REX_FEATURE_PHANTOM),
    signalLayer: parseBoolean(process.env.REX_FEATURE_SIGNAL_LAYER)
  };

  const csv = process.env.REX_FEATURES;
  if (csv) {
    for (const f of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
      flags[f] = true;
    }
  }

  return flags;
}

/* -------------------------------------------------------------------------- */
/*                                PROVIDERS                                   */
/* -------------------------------------------------------------------------- */

function parseProviders(): ProviderConfig[] {
  const out: ProviderConfig[] = [];

  /**
   * Explicit list (optional)
   * REX_PROVIDERS=openai:1,groq:2,gemini:3
   */
  const csv = process.env.REX_PROVIDERS;
  if (csv) {
    for (const item of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [rawName, pr] = item.split(':');
      const name = rawName.toLowerCase();
      const priority = pr ? parseInt(pr, 10) : undefined;
      const enabledEnv = process.env[`REX_PROVIDER_${name.toUpperCase()}_ENABLED`];
      const enabled = enabledEnv ? parseBoolean(enabledEnv) : true;

      out.push({ name, enabled, priority });
    }
  }

  /**
   * Auto-detect providers via API keys
   * IMPORTANT:
   * - Groq is a provider
   * - LLaMA is NOT a provider → DO NOT auto-register it
   */
  const wellKnownProviders = [
    'OPENAI',
    'CLAUDE',
    'GEMINI',
    'GROQ',
    'QWEN',
    'MISTRAL',
    'DEEPSEEK'
  ];

  for (const key of wellKnownProviders) {
    const apiKey = process.env[`${key}_API_KEY`];
    if (!apiKey) continue;

    const name = key.toLowerCase();
    if (!out.find((p) => p.name === name)) {
      out.push({
        name,
        enabled: true
      });
    }
  }

  /**
   * Provider metadata (GEN 1 heuristics)
   * Used for routing + scoring
   */
  for (const p of out) {
    if (!p.meta) p.meta = {};

    switch (p.name) {
      case 'openai':
        p.meta.defaultModel = 'gpt-4o';
        p.meta.defaultTemperature = 0.6;
        p.meta.costPer1k = 0.01;
        p.meta.latencyMs = 400;
        break;

      case 'groq':
        p.meta.defaultModel = 'llama-3.1-70b';
        p.meta.defaultTemperature = 0.4;
        p.meta.costPer1k = 0.0005;
        p.meta.latencyMs = 80;
        break;

      case 'gemini':
        p.meta.defaultModel = 'gemini-1.5-pro';
        p.meta.defaultTemperature = 0.5;
        p.meta.costPer1k = 0.002;
        p.meta.latencyMs = 300;
        break;

      case 'mistral':
        p.meta.defaultModel = 'mistral-large';
        p.meta.defaultTemperature = 0.6;
        p.meta.costPer1k = 0.003;
        p.meta.latencyMs = 350;
        break;

      case 'deepseek':
        p.meta.defaultModel = 'deepseek-coder';
        p.meta.defaultTemperature = 0.2;
        p.meta.costPer1k = 0.0008;
        p.meta.latencyMs = 250;
        break;
    }
  }

  /**
   * Normalize priorities
   */
  const withPriority = out.filter((p) => typeof p.priority === 'number');
  if (withPriority.length > 0) {
    out.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
    let next = 1;
    for (const p of out) {
      if (typeof p.priority !== 'number') {
        p.priority = ++next;
      }
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*                                 CONFIG                                     */
/* -------------------------------------------------------------------------- */

function buildConfig(): RExConfig {
  const env = (process.env.REX_ENV || process.env.NODE_ENV || 'development') as Env;

  const costLimitUsd = parseNumber(process.env.REX_COST_LIMIT_USD);
  const tokenLimit = parseNumber(process.env.REX_TOKEN_LIMIT);
  const defaultTimeoutMs = parseNumber(process.env.REX_DEFAULT_TIMEOUT_MS) ?? 30_000;

  if (costLimitUsd !== undefined && costLimitUsd < 0) {
    logger.warn('Invalid REX_COST_LIMIT_USD, ignoring negative value');
  }

  if (tokenLimit !== undefined && tokenLimit < 0) {
    logger.warn('Invalid REX_TOKEN_LIMIT, ignoring negative value');
  }

  return Object.freeze({
    env,
    nodeEnv: process.env.NODE_ENV,
    costLimitUsd: costLimitUsd ?? undefined,
    tokenLimit: tokenLimit ?? undefined,
    defaultTimeoutMs,
    features: parseFeatureFlags(),
    providers: parseProviders()
  });
}

const config = buildConfig();

/* -------------------------------------------------------------------------- */
/*                                   EXPORTS                                  */
/* -------------------------------------------------------------------------- */

export function getConfig(): Readonly<RExConfig> {
  return config;
}

export function isFeatureEnabled(name: keyof FeatureFlags | string): boolean {
  return Boolean((config.features as any)[name]);
}

export function getProvidersOrdered(): ProviderConfig[] {
  return [...config.providers].sort(
    (a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
  );
}

export function getProvider(name: string): ProviderConfig | undefined {
  return config.providers.find((p) => p.name === name);
}

export default {
  getConfig,
  isFeatureEnabled,
  getProvidersOrdered,
  getProvider
};
