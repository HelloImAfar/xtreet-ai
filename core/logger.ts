type LogMeta = Record<string, any> | undefined;
export const logger = {
  info: (msg: string | object, meta?: LogMeta) => {
    const payload = typeof msg === 'string' ? { message: msg } : msg;
    console.log(JSON.stringify({ level: 'info', ...payload, meta, ts: new Date().toISOString() }));
  },
  warn: (msg: string | object, meta?: LogMeta) => {
    const payload = typeof msg === 'string' ? { message: msg } : msg;
    console.warn(JSON.stringify({ level: 'warn', ...payload, meta, ts: new Date().toISOString() }));
  },
  error: (msg: string | object, meta?: LogMeta) => {
    const payload = typeof msg === 'string' ? { message: msg } : msg;
    console.error(JSON.stringify({ level: 'error', ...payload, meta, ts: new Date().toISOString() }));
  }
};

export default logger;
