import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export interface AtomicWriter { write(file: string, content: string): Promise<void>; }
export class AtomicFileWriter implements AtomicWriter {
  constructor(private files: Pick<typeof fs, 'open' | 'rename' | 'unlink'> = fs) {}
  async write(file: string, content: string): Promise<void> {
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      const handle = await this.files.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await this.files.rename(temporary, file);
    } catch (error) { await this.files.unlink(temporary).catch(() => undefined); throw error; }
  }
}
