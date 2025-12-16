import type { CostReport } from '@/types/rex';

type BreakdownKey = { provider: string; model: string };

const DEFAULT_PRICE_PER_1K: Record<string, number> = {
  'gpt-4o-mini': 0.03,
  'gpt-4.1': 0.12,
  'gpt-4': 0.06,
  'gpt-3.5-turbo': 0.002,
};

type UsageEntry = {
  provider: string;
  model: string;
  tokensInput?: number;
  tokensOutput?: number;
  costUSD?: number;
};

/**
 * Simple in-memory per-user accumulator. For production this would be persisted.
 */
const userAccum: Map<string, { tokens: number; cost: number }> = new Map();

export class CostController {
  private userId?: string;
  private requestId?: string;
  private entries: UsageEntry[] = [];
  private requestTokenLimit?: number;
  private requestCostLimit?: number;
  private userTokenLimit?: number;
  private userCostLimit?: number;

  constructor(opts?: { userId?: string; requestId?: string; requestTokenLimit?: number; requestCostLimit?: number; userTokenLimit?: number; userCostLimit?: number }) {
    this.userId = opts?.userId;
    this.requestId = opts?.requestId;
    this.requestTokenLimit = opts?.requestTokenLimit;
    this.requestCostLimit = opts?.requestCostLimit;
    this.userTokenLimit = opts?.userTokenLimit;
    this.userCostLimit = opts?.userCostLimit;
  }

  /**
   * Add usage. If costUSD not provided, try to estimate using price table and tokens.
   */
  addUsage(u: UsageEntry) {
    const entry = { ...u };
    if (entry.costUSD === undefined) {
      const per1k = DEFAULT_PRICE_PER_1K[entry.model] ?? 0.01;
      const tokens = (entry.tokensOutput || 0) + (entry.tokensInput || 0);
      entry.costUSD = Number(((tokens / 1000) * per1k).toFixed(6));
    }
    this.entries.push(entry);

    // update user accumulator
    if (this.userId) {
      const cur = userAccum.get(this.userId) || { tokens: 0, cost: 0 };
      cur.tokens += (entry.tokensOutput || 0) + (entry.tokensInput || 0);
      cur.cost += entry.costUSD || 0;
      userAccum.set(this.userId, cur);
    }
  }

  getReport(): CostReport {
    const tokensInput = this.entries.reduce((s, e) => s + (e.tokensInput || 0), 0);
    const tokensOutput = this.entries.reduce((s, e) => s + (e.tokensOutput || 0), 0);
    const totalTokens = tokensInput + tokensOutput;
    const estimatedCost = this.entries.reduce((s, e) => s + (e.costUSD || 0), 0);
    const breakdown = this.entries.map((e) => ({ provider: e.provider, model: e.model, tokens: (e.tokensInput || 0) + (e.tokensOutput || 0), cost: e.costUSD || 0 }));
    return { tokensInput, tokensOutput, totalTokens, estimatedCost, breakdown } as CostReport;
  }

  /**
   * Check for limit violations (request and per-user). Returns array of issues.
   */
  checkLimits(): string[] {
    const issues: string[] = [];
    const report = this.getReport();
    if (this.requestTokenLimit && report.totalTokens > this.requestTokenLimit) {
      issues.push(`request token limit exceeded: ${report.totalTokens} > ${this.requestTokenLimit}`);
    }
    if (this.requestCostLimit && report.estimatedCost > this.requestCostLimit) {
      issues.push(`request cost limit exceeded: ${report.estimatedCost.toFixed(6)} > ${this.requestCostLimit}`);
    }
    if (this.userId) {
      const acc = userAccum.get(this.userId) || { tokens: 0, cost: 0 };
      if (this.userTokenLimit && acc.tokens > this.userTokenLimit) {
        issues.push(`user token limit exceeded: ${acc.tokens} > ${this.userTokenLimit}`);
      }
      if (this.userCostLimit && acc.cost > this.userCostLimit) {
        issues.push(`user cost limit exceeded: ${acc.cost.toFixed(6)} > ${this.userCostLimit}`);
      }
    }
    return issues;
  }

  static resetUserAccum(userId: string) {
    userAccum.delete(userId);
  }
}

export default { CostController };
