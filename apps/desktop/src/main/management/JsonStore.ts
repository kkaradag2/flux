import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ManagementError } from './ManagementError';
export class JsonStore<T extends { id: string }> {
 private queue: Promise<unknown> = Promise.resolve();
 constructor(private file: string, private parse: (value: unknown) => T, private seed: () => T[]) {}
 private async read(): Promise<T[]> {
  let source: string;
  try { source = await readFile(this.file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new ManagementError('READ_FAILED', 'Saved data could not be read.'); }
  if (!source.trim()) return [];
  try { const data: unknown = JSON.parse(source); if (!Array.isArray(data)) throw new Error(); const values = data.map(this.parse); if (new Set(values.map(item => item.id)).size !== values.length) throw new Error(); return values; }
  catch { throw new ManagementError('INVALID_JSON', path.basename(this.file) + ' is invalid. The original file has been preserved.'); }
 }
 private async write(items: T[]): Promise<void> {
  const temp = this.file + '.' + randomUUID() + '.tmp';
  try { await mkdir(path.dirname(this.file), { recursive: true }); await writeFile(temp, JSON.stringify(items, null, 2) + '\n', { flag: 'wx' }); await rename(temp, this.file); }
  catch { await unlink(temp).catch(() => undefined); throw new ManagementError('WRITE_FAILED', 'Changes could not be saved. The previous data has been preserved.'); }
 }
 transaction<R>(action: (items: T[]) => Promise<{ items: T[]; result: R }> | { items: T[]; result: R }): Promise<R> {
  const operation = this.queue.then(async () => { let items = await this.read(); if (!items.length) { items = this.seed(); await this.write(items); } const next = await action(items); await this.write(next.items); return next.result; });
  this.queue = operation.catch(() => undefined); return operation;
 }
 list(): Promise<T[]> {
  const operation = this.queue.then(async () => { let items = await this.read(); if (!items.length) { items = this.seed(); await this.write(items); } return items; });
  this.queue = operation.catch(() => undefined); return operation;
 }
}
