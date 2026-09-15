import path from 'node:path';
import { ProjectError } from './ProjectError';

export function pathKey(value: string): string {
  if (!value || value.length > 32767 || value.includes('\0') || !path.isAbsolute(value)) {
    throw new ProjectError('INVALID_PATH', 'Please select an absolute project folder path.');
  }
  const normalized = path.normalize(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
