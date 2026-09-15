import { open, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assetId } from './validation';
import { ManagementError } from './ManagementError';
const limit = 2 * 1024 * 1024;
export class AgentAssetService {
 constructor(private directory: string, private decode: (data: Buffer) => boolean) {}
 private async read(file: string): Promise<Buffer> {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new ManagementError('INVALID_IMAGE', 'Select a regular image file.');
  if (metadata.size > limit) throw new ManagementError('IMAGE_TOO_LARGE', 'Avatar images must be 2 MB or smaller.');
  const handle = await open(file, 'r');
  try { const buffer = Buffer.alloc(limit + 1); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0); if (bytesRead > limit) throw new ManagementError('IMAGE_TOO_LARGE', 'Avatar images must be 2 MB or smaller.'); return buffer.subarray(0, bytesRead); }
  finally { await handle.close(); }
 }
 private validate(data: Buffer, extension: string): void {
  const valid = extension === 'png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
   : extension === 'webp' ? data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
   : data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (!valid || !this.decode(data)) throw new ManagementError('INVALID_IMAGE', 'The selected file is not a valid supported image (maximum dimensions: 4096 × 4096).');
 }
 async importImage(file: string): Promise<string> {
  const extension = path.extname(file).slice(1).toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(extension)) throw new ManagementError('IMAGE_FORMAT', 'Choose a PNG, JPG, JPEG or WebP image.');
  const data = await this.read(file); this.validate(data, extension);
  const id = randomUUID() + '.' + extension;
  await mkdir(this.directory, { recursive: true }); await writeFile(path.join(this.directory, id), data, { flag: 'wx' }); return id;
 }
 async getDataUrl(value: unknown): Promise<string> {
  const id = assetId(value); const extension = path.extname(id).slice(1);
  const data = await this.read(path.join(this.directory, id)); this.validate(data, extension);
  return 'data:image/' + (extension === 'jpg' ? 'jpeg' : extension) + ';base64,' + data.toString('base64');
 }
}
