import type { AgentResult, PipelineContext, VerificationResult } from '@/types/rex';

/**
 * Provider-agnostic verifier utilities.
 * - verifyAgentResult: checks a single AgentResult for hallucinations, logic issues and instruction violations
 * - verifyTaskResults: compares multiple AgentResults for the same task
 * - verifyPipeline: runs verification across PipelineContext.agentResults and returns a map of results
 */

function findForbiddenInstructions(text: string): string[] {
  const matches: string[] = [];
  const pattern = /(don't|do not|avoid|never|must not|no)\s+([^\.!?,;\n]{3,80})/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    matches.push(m[2].trim());
  }
  return matches;
}

function instructionViolationCheck(requestText: string, resultText: string): { issues: string[]; corrections: string[] } {
  const issues: string[] = [];
  const corrections: string[] = [];
  const forbidden = findForbiddenInstructions(requestText || '');
  for (const f of forbidden) {
    // naive substring check
    if (f && resultText.toLowerCase().includes(f.toLowerCase())) {
      issues.push(`Instruction violation: output contains forbidden phrase "${f}"`);
      corrections.push(`Remove or respect instruction: do not ${f}`);
    }
  }
  return { issues, corrections };
}

function logicalInconsistencyCheck(text: string): { issues: string[]; corrections: string[] } {
  const issues: string[] = [];
  const corrections: string[] = [];

  // Heuristic: contradictory modal statements
  const contradictionPattern = /(don't|do not|avoid|never)\s+([\w\s]{3,60})\b[\s\S]*\b(do|please|should)\s+\2/gi;
  if (contradictionPattern.test(text)) {
    issues.push('Contradiction detected in output (conflicting instructions/claims).');
    corrections.push('Clarify or remove conflicting instructions/claims.');
  }

  // Heuristic: repeated step in sequence e.g. "first X then X"
  if (/first[^.]*\b([\w\s]{3,})\b[^.]*then[^.]*\b\1\b/i.test(text)) {
    issues.push('Repeated step detected in sequence.');
    corrections.push('Review sequence for duplicated steps.');
  }

  // Heuristic: internal contradiction e.g. "A and not A"
  const tokens = (text || '').toLowerCase().split(/\b/).filter(Boolean);
  if (tokens.includes('yes') && tokens.includes('no')) {
    issues.push('Conflicting polarity detected (both yes and no present).');
    corrections.push('Resolve polarity contradictions.');
  }

  return { issues, corrections };
}

function hallucinationCheck(result: AgentResult, ctx?: PipelineContext): { issues: string[]; corrections: string[] } {
  const issues: string[] = [];
  const corrections: string[] = [];
  const t = result.text || '';

  // Heuristic: presence of specific factual claims (numbers/dates/proper nouns) without citation or source
  const hasSpecificFacts = /\b\d{3,}|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/.test(t);
  const hasCitation = /\b(source|according to|cite|https?:\/\/|\[\d+\])\b/i.test(t) || (result.meta && result.meta.sources);
  if (hasSpecificFacts && !hasCitation) {
    issues.push('Possible hallucination: specific factual claims without citations');
    corrections.push('Add citations or mark claims as uncertain.');
  }

  // Heuristic: if provider returned a 'raw' meta with an empty usage or suspicious tokens, flag low-confidence
  if (result.meta && result.meta.raw && typeof result.meta.raw === 'object') {
    const raw = result.meta.raw as any;
    if (raw.choices && Array.isArray(raw.choices) && raw.choices.length === 0) {
      issues.push('Empty model choices — potential error or hallucination.');
      corrections.push('Verify model response or re-run with different parameters.');
    }
  }

  return { issues, corrections };
}

export function verifyAgentResult(result: AgentResult, ctx?: PipelineContext): VerificationResult {
  const issues: Array<{ type: string; message: string; severity?: 'low' | 'medium' | 'high' }> = [];
  const corrections: string[] = [];

  // Instruction violation: check against original request text if available
  const requestText = ctx?.request?.text || '';
  const instr = instructionViolationCheck(requestText, result.text || '');
  instr.issues.forEach((m) => issues.push({ type: 'instruction-violation', message: m, severity: 'high' }));
  corrections.push(...instr.corrections);

  // Logical inconsistencies
  const logic = logicalInconsistencyCheck(result.text || '');
  logic.issues.forEach((m) => issues.push({ type: 'logical', message: m, severity: 'medium' }));
  corrections.push(...logic.corrections);

  // Hallucination heuristics
  const hall = hallucinationCheck(result, ctx);
  hall.issues.forEach((m) => issues.push({ type: 'hallucination', message: m, severity: 'medium' }));
  corrections.push(...hall.corrections);

  const verified = issues.length === 0;

  return {
    verified,
    corrections: corrections.length ? corrections : undefined,
    issues: issues.length ? issues : undefined,
    details: {
      checkedAt: new Date().toISOString(),
    },
  };
}

export function verifyTaskResults(taskId: string, results: AgentResult[], ctx?: PipelineContext): VerificationResult {
  // Verify each result and also cross-compare for contradictions
  const allIssues: Array<{ type: string; message: string; severity?: 'low' | 'medium' | 'high' }> = [];
  const corrections: string[] = [];

  for (const r of results) {
    const vr = verifyAgentResult(r, ctx);
    if (vr.issues) allIssues.push(...vr.issues);
    if (vr.corrections) corrections.push(...vr.corrections);
  }

  // Cross-result consistency heuristic: compare texts for direct contradictions
  const texts = results.map((r) => (r.text || '').toLowerCase());
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (texts[i] && texts[j] && texts[i] !== texts[j]) {
        // simple check: if one contains "no" and other contains "yes" -> contradiction
        if ((texts[i].includes('no') && texts[j].includes('yes')) || (texts[i].includes('yes') && texts[j].includes('no'))) {
          allIssues.push({ type: 'logical', message: 'Contradictory outputs between providers/models', severity: 'medium' });
        }
      }
    }
  }

  const verified = allIssues.length === 0;
  return {
    verified,
    corrections: corrections.length ? corrections : undefined,
    issues: allIssues.length ? allIssues : undefined,
    details: { taskId, checkedAt: new Date().toISOString() },
  };
}

export function verifyPipeline(ctx: PipelineContext): Record<string, VerificationResult> {
  const out: Record<string, VerificationResult> = {};
  const agentResults = ctx.agentResults || {};
  for (const taskId of Object.keys(agentResults)) {
    const results = agentResults[taskId];
    out[taskId] = verifyTaskResults(taskId, results, ctx);
  }
  return out;
}

export default { verifyAgentResult, verifyTaskResults, verifyPipeline };