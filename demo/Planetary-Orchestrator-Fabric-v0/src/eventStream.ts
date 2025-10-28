import { createWriteStream, WriteStream } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { FabricEvent } from './types';

export class EventStream {
  private readonly stream: WriteStream;

  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.stream = createWriteStream(filePath, { flags: 'a' });
  }

  public write(event: FabricEvent): void {
    this.stream.write(`${JSON.stringify(event)}\n`);
  }

  public close(): void {
    this.stream.end();
  }
}
