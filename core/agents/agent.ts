import type { PipelineContext } from '@/types/rex';

// Minimal logger compatible con GEN 1
const logger = {
  info: (obj: any) => console.log('[INFO]', obj),
  error: (obj: any) => console.error('[ERROR]', obj),
};

export type AgentInput = {
  taskId?: string;
  text: string;
  ctx?: PipelineContext;
};

export type AgentOutput = {
  agentId: string;
  taskId?: string;
  text?: string;
  notes?: string[];
  issues?: Array<{ type: string; message: string }>;
  metadata?: Record<string, any>;
};

export type Agent = {
  id: string;
  run: (input: AgentInput) => Promise<AgentOutput>;
};

export async function runAgents(
  agents: Agent[],
  input: AgentInput,
  opts?: { parallel?: boolean }
): Promise<AgentOutput[]> {
  if (!agents || agents.length === 0) return [];

  const executed = new Set<string>();

  const runOne = async (a: Agent) => {
    const key = `${input.taskId}_${a.id}`;
    if (executed.has(key)) {
      logger.info({ event: 'agent_skipped', agentId: a.id, taskId: input.taskId });
      return null;
    }
    executed.add(key);

    try {
      const out = await a.run(input);
      logger.info({ event: 'agent_executed', agentId: a.id, taskId: input.taskId });
      return out;
    } catch (e: any) {
      logger.error({ event: 'agent_error', agentId: a.id, taskId: input.taskId, error: e?.message || String(e) });
      return {
        agentId: a.id,
        taskId: input.taskId,
        notes: [],
        issues: [{ type: 'error', message: String(e) }],
        metadata: {},
      };
    }
  };

  if (opts?.parallel) {
    const results = await Promise.all(agents.map(runOne));
    return results.filter(Boolean) as AgentOutput[];
  }

  const outputs: AgentOutput[] = [];
  for (const a of agents) {
    const out = await runOne(a);
    if (out) outputs.push(out);
  }

  return outputs;
}

export default { runAgents };
