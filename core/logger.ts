type LogMeta = Record<string, any> | undefined;

type LogEntry = {
  level: 'info' | 'warn' | 'error';
  event?: string;
  message?: string;
  requestId?: string;
  step?: string;
  provider?: string;
  model?: string;
  elapsedMs?: number;
  cost?: any;
  meta?: LogMeta;
  ts: string;
};

function emit(level: LogEntry['level'], entry: Omit<LogEntry, 'level' | 'ts'>) {
  const payload: LogEntry = { level, ts: new Date().toISOString(), ...entry };
  const s = JSON.stringify(payload);
  if (level === 'info') console.log(s);
  else if (level === 'warn') console.warn(s);
  else console.error(s);
}

export const logger = {
  info: (msg: string | object, meta?: LogMeta) => {
    const payload = typeof msg === 'string' ? { message: msg } : msg;
    emit('info', { ...payload, meta });
  },
  warn: (msg: string | object, meta?: LogMeta) => {
    const payload = typeof msg === 'string' ? { message: msg } : msg;
    emit('warn', { ...payload, meta });
  },
  error: (msg: string | object, meta?: LogMeta) => {
    const payload = typeof msg === 'string' ? { message: msg } : msg;
    emit('error', { ...payload, meta });
  },

  // Start a timed span and return an end() function that logs elapsed time
  startSpan: (name: string, opts?: { requestId?: string; step?: string; meta?: LogMeta }) => {
    const start = Date.now();
    const requestId = opts?.requestId;
    const step = opts?.step || name;
    return (endMeta?: LogMeta) => {
      const elapsedMs = Date.now() - start;
      emit('info', { event: 'span', message: `${name} completed`, requestId, step, elapsedMs, meta: { ...opts?.meta, ...endMeta } });
      return elapsedMs;
    };
  },

  logPipelineStep: (requestId: string | undefined, step: string, status: 'start' | 'end' | 'error' = 'start', meta?: LogMeta) => {
    emit(status === 'error' ? 'error' : status === 'end' ? 'info' : 'info', { event: 'pipeline_step', requestId, step, meta, message: `pipeline ${step} ${status}` });
  },

  logProviderError: (requestId: string | undefined, provider: string, model: string | undefined, err: any, meta?: LogMeta) => {
    const message = err?.message || String(err);
    emit('error', { event: 'provider_error', requestId, provider, model, meta: { ...meta, error: message, stack: err?.stack } });
  },

  logCostReport: (requestId: string | undefined, costReport: any, meta?: LogMeta) => {
    emit('info', { event: 'cost_report', requestId, cost: costReport, meta });
  },
};

export default logger;
