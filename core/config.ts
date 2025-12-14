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
  priority?: number; // lower is higher priority (1 = top)
  meta?: Record<string, any>;
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

function parseNumber(envVar?: string): number | undefined {
  if (!envVar) return undefined;
  const n = Number(envVar);
  if (Number.isFinite(n)) return n;
  return undefined;
}

function parseBoolean(envVar?: string): boolean {
  if (!envVar) return false;
  return ['1', 'true', 'yes', 'on'].includes(envVar.toLowerCase());
}

function parseFeatureFlags(): FeatureFlags {
  // Default flags false; variable-driven
  const flags: FeatureFlags = {
    multicore: parseBoolean(process.env.REX_FEATURE_MULTICORE),
    sei: parseBoolean(process.env.REX_FEATURE_SEI),
    phantom: parseBoolean(process.env.REX_FEATURE_PHANTOM),
    signalLayer: parseBoolean(process.env.REX_FEATURE_SIGNAL_LAYER)
  };

  // Also allow a comma-separated list: REX_FEATURES=multicore,sei
  const csv = process.env.REX_FEATURES;
  if (csv) {
    for (const f of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
      flags[f] = true;
    }
  }

  return flags;
}

function parseProviders(): ProviderConfig[] {
  const out: ProviderConfig[] = [];

  const csv = process.env.REX_PROVIDERS; // format: name[:priority],name2[:priority]
  if (csv) {
    for (const item of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [rawName, pr] = item.split(':').map((x) => x.trim());
      const name = rawName;
      const priority = pr ? parseInt(pr, 10) : undefined;
      const enabledEnv = process.env[`REX_PROVIDER_${name.toUpperCase()}_ENABLED`];
      const enabled = enabledEnv ? parseBoolean(enabledEnv) : true; // if explicitly listed, default to enabled
      out.push({ name, enabled, priority });
    }
  }

  // Also discover common providers via *_API_KEY env var and include them if not already present
  const wellKnown = ['OPENAI', 'CLAUDE', 'GEMINI', 'GROK', 'QWEN', 'MISTRAL', 'LLAMA'];
  for (const key of wellKnown) {
    const apiKey = process.env[`${key}_API_KEY`];
    if (apiKey) {
      const name = key.toLowerCase();
      if (!out.find((p) => p.name === name)) {
        out.push({ name, enabled: true });
      }
    }
  }

  // Normalize priorities if any present
  const withPriority = out.filter((p) => typeof p.priority === 'number');
  if (withPriority.length > 0) {
    // sort by priority and assign missing priorities after
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

function buildConfig(): RExConfig {
  const env = (process.env.REX_ENV || process.env.NODE_ENV || 'development') as Env;
  const costLimitUsd = parseNumber(process.env.REX_COST_LIMIT_USD);
  const tokenLimit = parseNumber(process.env.REX_TOKEN_LIMIT);
  const defaultTimeoutMs = parseNumber(process.env.REX_DEFAULT_TIMEOUT_MS) ?? 30000;
  const features = parseFeatureFlags();
  const providers = parseProviders();

  // Basic validation
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
    features,
    providers
  });
}

const config = buildConfig();

export function getConfig(): Readonly<RExConfig> {
  return config;
}

export function isFeatureEnabled(name: keyof FeatureFlags | string): boolean {
  // allow user-specified flags too
  return Boolean((config.features as any)[name]);
}

export function getProvidersOrdered(): ProviderConfig[] {
  return [...config.providers].sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER));
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
