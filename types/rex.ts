import type { Category, MessageRequest } from './index';

/* ============================================================
   REx — Core Types (GEN 1)
   ============================================================ */

/**
 * Request object entering the REx pipeline
 */
export interface RExRequest extends MessageRequest {
  options?: {
    stream?: boolean;
    costLimit?: number; // USD or token-based threshold
    priority?: 'low' | 'normal' | 'high';
    maxConcurrency?: number; // per-request concurrency hint
  };
}

/**
 * Intent profile returned by classifier / intent detector
 */
export interface IntentProfile {
  intent: string; // short intent label
  category: Category;
  confidence: number; // 0..1
  risk?: {
    severity: 'low' | 'medium' | 'high';
    reasons?: string[];
  };
  entities?: Record<string, any>;
}

/**
 * A decomposed micro-task derived from RExRequest
 */
export interface DecomposedTask {
  id: string;
  text: string;
  role?: 'user' | 'assistant' | 'system';
  meta?: Record<string, any>;
  dependencies?: string[]; // task ids that must complete first
  priority?: number; // higher = execute earlier
}

/**
 * Candidate model/provider for routing
 */
export interface ModelCandidate {
  provider: string; // e.g. 'openai', 'claude'
  model: string; // model id
  temperature?: number;

  /** Routing heuristics */
  costEstimate?: number; // rough cost per 1k tokens or per call
  latencyEstimateMs?: number;
  priority?: number; // lower = preferred (used by router scoring)

  reason?: string; // why selected as candidate
}

/**
 * Routing decision for a single decomposed task
 */
export interface RoutingDecision {
  taskId: string;
  candidates: ModelCandidate[];
  selected?: ModelCandidate;
  parallel?: boolean; // whether to fan-out to multiple models
}

/**
 * Result from an individual agent/model call
 */
export interface AgentResult {
  taskId: string;
  agentId?: string; // internal agent id
  provider: string;
  model: string;
  text: string;
  tokensUsed?: number;
  cost?: number;
  meta?: Record<string, any>;
  status: 'fulfilled' | 'rejected' | 'timeout' | 'cancelled';
}

/**
 * Verification result (DeepSeek stub or external verifier)
 */
export interface VerificationResult {
  verified: boolean;
  corrections?: string[];
  issues?: Array<{
    type: string;
    message: string;
    severity?: 'low' | 'medium' | 'high';
  }>;
  details?: Record<string, any>;
}

/**
 * Cost breakdown item
 */
export interface CostBreakdownItem {
  provider: string;
  model: string;
  tokens: number;
  cost: number;
}

/**
 * Cost report for a request
 */
export interface CostReport {
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  estimatedCost: number; // USD
  breakdown?: CostBreakdownItem[];
}

/**
 * PipelineContext collects state as the request flows through REx
 */
export interface PipelineContext {
  request: RExRequest;
  intent?: IntentProfile;
  memorySnapshot?: Record<string, any>;
  tasks?: DecomposedTask[];
  routing?: Record<string, RoutingDecision>;
  agentResults?: Record<string, AgentResult[]>; // keyed by taskId
  verification?: Record<string, VerificationResult>;
  cost?: CostReport;
  logs?: Array<{
    ts: string;
    message: string;
    meta?: Record<string, any>;
  }>;
}

/**
 * Final response returned by the REx Engine
 */
export interface RExResponse {
  ok: boolean;
  text?: string; // final human-facing text
  structured?: any; // structured / JSON payload
  context?: PipelineContext; // optional debug / telemetry
  cost?: CostReport;
  errors?: string[];
}
