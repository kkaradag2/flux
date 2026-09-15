import type { TeamDefinition } from '../../shared/management-api';
import type { TeamRepository } from './TeamRepository';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AtomicFileWriter } from '../persistence/AtomicFileWriter';
import { storedTeam, teamInput } from './validation';
import { parseTeamFile, type TeamFile } from './teamRecord';
import { defaultTeams } from './defaults';
import { ManagementError } from './ManagementError';
export class JsonTeamRepository implements TeamRepository {
 private static queues = new Map<string, Promise<unknown>>();
 private file: string;
 constructor(file: string) { this.file = path.resolve(file); }
 private serialize<T>(action: () => Promise<T>): Promise<T> {
  const key = process.platform === 'win32' ? this.file.toLowerCase() : this.file;
  const operation = (JsonTeamRepository.queues.get(key) ?? Promise.resolve()).then(action);
  const settled = operation.catch(() => undefined);
  JsonTeamRepository.queues.set(key, settled);
  void settled.then(() => { if (JsonTeamRepository.queues.get(key) === settled) JsonTeamRepository.queues.delete(key); });
  return operation;
 }
 private async read(): Promise<TeamDefinition[]> {
  let source: string;
  try { source = await readFile(this.file, 'utf8'); }
  catch (error) {
   if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ManagementError('READ_FAILED', 'Saved teams could not be read.');
   const teams = defaultTeams(); await this.write(teams); return teams;
  }
  let data: unknown;
  try { data = JSON.parse(source); }
  catch { throw new ManagementError('INVALID_JSON', 'Saved teams are invalid. The original file has been preserved.'); }
  const { teams, migrated } = parseTeamFile(data);
  if (migrated) await this.write(teams);
  return teams;
 }
 private async write(teams: TeamDefinition[]): Promise<void> {
  const data: TeamFile = { schemaVersion: 1, teams };
  try { await mkdir(path.dirname(this.file), { recursive: true }); await new AtomicFileWriter().write(this.file, JSON.stringify(data, null, 2) + '\n'); }
  catch { throw new ManagementError('WRITE_FAILED', 'Changes could not be saved. The previous data has been preserved.'); }
 }
 list(): Promise<TeamDefinition[]> { return this.serialize(() => this.read()); }
 save(value: TeamDefinition, create: boolean): Promise<TeamDefinition> {
  return this.serialize(async () => {
   teamInput(value, true); // Strict on writes, including incomplete legacy teams.
   const valid = storedTeam(value);
   const items = await this.read();
   const index = items.findIndex(item => item.id === valid.id);
   if (create ? index >= 0 : index < 0) throw new ManagementError('NOT_FOUND', 'Team could not be saved. Refresh the list.');
   if (create) items.push(valid); else items[index] = valid;
   await this.write(items);
   return valid;
  });
 }
}
