import fs from 'node:fs';
import { Console } from 'node:console';

export class AlphaNodeLogger {
  private readonly stream: fs.WriteStream;
  private readonly console: Console;

  constructor(logFile: string) {
    this.stream = fs.createWriteStream(logFile, { flags: 'a' });
    this.console = new Console({ stdout: this.stream, stderr: this.stream });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.console.log(JSON.stringify({ level: 'info', message, context, timestamp: new Date().toISOString() }));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.console.warn(JSON.stringify({ level: 'warn', message, context, timestamp: new Date().toISOString() }));
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.console.error(JSON.stringify({ level: 'error', message, context, timestamp: new Date().toISOString() }));
  }

  close(): void {
    this.stream.close();
  }
}
