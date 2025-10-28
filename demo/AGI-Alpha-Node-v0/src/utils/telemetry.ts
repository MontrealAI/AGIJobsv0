import pino from 'pino';

const BASE_LEVEL = process.env.LOG_LEVEL ?? 'info';
const IS_TEST = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

export function createLogger(name: string): pino.Logger {
  return pino({
    name,
    level: BASE_LEVEL,
    transport:
      process.env.NODE_ENV === 'production' || IS_TEST
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard'
            }
          }
  });
}
