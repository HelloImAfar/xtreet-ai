import type { PipelineContext } from '@/types/rex';

export type AgentInput = {
  taskId?: string;
  text: string;
  ctx?: PipelineContext;
};

export type AgentOutput = {
  agentId: string;
  taskId?: string;
  text?: string; // transformed text or annotations
  notes?: string[]; // suggestions or notes
  issues?: Array<{ type: string; message: string }>; // problems found
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
  if (opts?.parallel) {
    return Promise.all(agents.map((a) => a.run(input)));
  }
  const outputs: AgentOutput[] = [];
  for (const a of agents) {
    // run sequentially
    // agents are stateless; runner doesn't persist state
    // catch errors to avoid breaking pipeline
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = await a.run(input);
      outputs.push(out);
    } catch (e: any) {
      outputs.push({ agentId: a.id, taskId: input.taskId, notes: [], issues: [{ type: 'error', message: String(e) }], metadata: {} });
    }
  }
  return outputs;
}

export default { runAgents };
