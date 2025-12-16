import type { PipelineContext, DecomposedTask } from '@/types/rex';

export type SecurityIssue = {
  type: string;
  message: string;
  severity?: 'low' | 'medium' | 'high';
};

/**
 * Detect prompt injection attempts in user input or task definitions.
 */
export function analyzePromptSafety(text: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const t = (text || '').toLowerCase();

  const injPatterns = [
    /ignore (previous|earlier) instructions/,
    /disregard (previous|earlier) instructions/,
    /override (the )?system prompt/,
    /bypass (the )?prompt/,
    /do not follow the previous instructions/,
    /exfiltrate|leak|send secret|secret key|api key|password/,
    /execute this code/,
  ];

  for (const p of injPatterns) {
    if (p.test(t)) {
      issues.push({
        type: 'prompt-injection',
        message: `Possible prompt injection phrase detected`,
        severity: 'high',
      });
    }
  }

  if (/https?:\/\//.test(t) && /fetch|download|retrieve|call|curl/.test(t)) {
    issues.push({
      type: 'prompt-injection',
      message: 'External resource manipulation detected in input',
      severity: 'medium',
    });
  }

  return issues;
}

/**
 * Detect cost abuse patterns (single call or aggregate across pipeline).
 */
export function analyzeCostAbuse(
  ctx: PipelineContext,
  opts?: { tokenThreshold?: number; totalTokenThreshold?: number }
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const tokenThreshold = opts?.tokenThreshold ?? 10_000;
  const totalTokenThreshold = opts?.totalTokenThreshold ?? 50_000;

  let totalTokens = 0;
  const agentResults = ctx.agentResults || {};

  for (const taskId of Object.keys(agentResults)) {
    for (const r of agentResults[taskId]) {
      const tokens = r.tokensUsed || 0;
      totalTokens += tokens;

      if (tokens > tokenThreshold) {
        issues.push({
          type: 'cost-abuse',
          message: `High token usage in single execution (${tokens} tokens, task ${taskId})`,
          severity: 'high',
        });
      }
    }
  }

  if (totalTokens > totalTokenThreshold) {
    issues.push({
      type: 'cost-abuse',
      message: `High aggregate token usage (${totalTokens} tokens)`,
      severity: 'high',
    });
  }

  return issues;
}

/**
 * Detect recursive execution loops via repeated outputs or task duplication.
 */
export function detectRecursiveLoop(
  ctx: PipelineContext,
  opts?: { repeatThreshold?: number }
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const repeatThreshold = opts?.repeatThreshold ?? 3;

  const textCounts: Record<string, number> = {};
  const agentResults = ctx.agentResults || {};

  for (const taskId of Object.keys(agentResults)) {
    for (const r of agentResults[taskId]) {
      const t = (r.text || '').trim();
      if (!t) continue;

      textCounts[t] = (textCounts[t] || 0) + 1;

      if (textCounts[t] === repeatThreshold) {
        issues.push({
          type: 'recursive-loop',
          message: `Repeated identical output detected ${repeatThreshold} times`,
          severity: 'medium',
        });
      }
    }
  }

  const tasks = ctx.tasks || [];
  const taskCounts: Record<string, number> = {};

  for (const task of tasks) {
    const t = (task.text || '').trim();
    if (!t) continue;

    taskCounts[t] = (taskCounts[t] || 0) + 1;

    if (taskCounts[t] === repeatThreshold) {
      issues.push({
        type: 'recursive-loop',
        message: `Repeated identical task detected ${repeatThreshold} times`,
        severity: 'high',
      });
    }
  }

  return issues;
}

/**
 * Enforce dependency depth limits to prevent runaway execution.
 */
export function enforceDepthLimits(
  tasks: DecomposedTask[],
  maxDepth = 5
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  if (!tasks || tasks.length === 0) return issues;

  const adj: Record<string, string[]> = {};
  const ids = new Set<string>();

  for (const t of tasks) {
    ids.add(t.id);
    adj[t.id] = (t.dependencies || []).slice();
  }

  const memo: Record<string, number> = {};

  function dfs(node: string, visiting = new Set<string>()): number {
    if (visiting.has(node)) return Infinity;
    if (memo[node] !== undefined) return memo[node];

    visiting.add(node);
    let depth = 1;

    for (const dep of adj[node] || []) {
      if (!ids.has(dep)) continue;
      const d = dfs(dep, visiting);
      if (d === Infinity) return Infinity;
      depth = Math.max(depth, 1 + d);
    }

    visiting.delete(node);
    memo[node] = depth;
    return depth;
  }

  let max = 0;
  for (const id of Object.keys(adj)) {
    const d = dfs(id);
    if (d === Infinity) {
      issues.push({
        type: 'depth-limit',
        message: 'Cycle detected in task dependency graph',
        severity: 'high',
      });
      return issues;
    }
    max = Math.max(max, d);
  }

  if (max > maxDepth) {
    issues.push({
      type: 'depth-limit',
      message: `Dependency depth ${max} exceeds limit ${maxDepth}`,
      severity: 'high',
    });
  }

  return issues;
}

/**
 * Run all security checks on pipeline input and structure.
 */
export function runSecurityChecks(
  ctx: PipelineContext,
  opts?: {
    tokenThreshold?: number;
    totalTokenThreshold?: number;
    repeatThreshold?: number;
    maxDepth?: number;
  }
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  const reqText = ctx.request?.text || ctx.request?.message || '';
  issues.push(...analyzePromptSafety(reqText));

  // Optional: check decomposed task definitions (not agent outputs)
  for (const task of ctx.tasks || []) {
    issues.push(...analyzePromptSafety(task.text || ''));
  }

  issues.push(
    ...analyzeCostAbuse(ctx, {
      tokenThreshold: opts?.tokenThreshold,
      totalTokenThreshold: opts?.totalTokenThreshold,
    })
  );

  issues.push(
    ...detectRecursiveLoop(ctx, {
      repeatThreshold: opts?.repeatThreshold,
    })
  );

  issues.push(
    ...enforceDepthLimits(ctx.tasks || [], opts?.maxDepth ?? 5)
  );

  return issues;
}

export default {
  analyzePromptSafety,
  analyzeCostAbuse,
  detectRecursiveLoop,
  enforceDepthLimits,
  runSecurityChecks,
};