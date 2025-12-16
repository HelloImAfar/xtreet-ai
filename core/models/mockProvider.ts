import { BaseModelProvider, ExecuteConfig, ExecuteResult } from './provider';

export class MockProvider extends BaseModelProvider {
  id = 'mock';
  private remainingFails: number;

  constructor(opts?: { failTimes?: number }) {
    super();
    this.remainingFails = opts?.failTimes || 0;
  }

  protected async _execute(prompt: string, _config: ExecuteConfig): Promise<Partial<ExecuteResult>> {
    if (this.remainingFails > 0) {
      this.remainingFails -= 1;
      throw new Error('simulated-failure');
    }

    const words = (prompt || '').split(/\s+/).filter(Boolean).length;
    const tokens = Math.ceil(words / 0.75);
    // simple echo provider
    return { text: prompt, tokensUsed: tokens, meta: { provider: 'mock' } };
  }
}

export default MockProvider;
