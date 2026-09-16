import { OrchestrationPersistenceError } from '../../application/orchestration/OrchestrationPersistenceError';
export type LegacyEventMetadata = Readonly<{ eventId: string; fields: Readonly<Record<string, string | boolean>> }>;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const allowed = ['requiresReview', 'reviewerAgentId', 'task.requiresReview', 'task.reviewerAgentId', 'type', 'status', 'from'];
export function parseLegacyMetadata(value: unknown): readonly LegacyEventMetadata[] {
 if (value === undefined) return [];
 if (!Array.isArray(value)) throw new OrchestrationPersistenceError('INVALID_RECORD');
 return value.map(entry => {
  if (!isRecord(entry) || typeof entry.eventId !== 'string' || !isRecord(entry.fields)) throw new OrchestrationPersistenceError('INVALID_RECORD');
  const fields: Record<string, string | boolean> = {};
  for (const [key, item] of Object.entries(entry.fields)) {
   if (!allowed.includes(key) || !(typeof item === 'boolean' || typeof item === 'string' && item.length <= 512)) throw new OrchestrationPersistenceError('INVALID_RECORD');
   fields[key] = item;
  }
  return { eventId: entry.eventId, fields };
 });
}
/** Pure migration; strings containing user-authored text are never rewritten. */
export function migrateOrchestrationRecord(value: unknown): Record<string, unknown> {
 if (!isRecord(value)) throw new OrchestrationPersistenceError('INVALID_RECORD');
 if (value.schemaVersion === 2) return value;
 if (value.schemaVersion !== 1) throw new OrchestrationPersistenceError('UNSUPPORTED_SCHEMA');
 const metadata: LegacyEventMetadata[] = [];
 if (Array.isArray(value.events)) for (const event of value.events) {
  if (!isRecord(event) || typeof event.id !== 'string') continue;
  const fields: Record<string, string | boolean> = {};
  for (const [prefix, item] of [['', event], ['task.', event.task]] as const) if (isRecord(item)) {
   if (typeof item.requiresReview === 'boolean') fields[prefix + 'requiresReview'] = item.requiresReview;
   if (typeof item.reviewerAgentId === 'string') fields[prefix + 'reviewerAgentId'] = item.reviewerAgentId;
  }
  for (const key of ['type','status','from']) if (event[key] === 'needs_review' || event[key] === 'task.needs_review') fields[key] = event[key];
  if (Object.keys(fields).length) metadata.push({ eventId: event.id, fields });
 }
 const convert = (item: unknown): unknown => {
  if (Array.isArray(item)) return item.map(convert);
  if (!isRecord(item)) return item;
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(item)) {
   if (key === 'requiresReview' || key === 'reviewerAgentId') continue;
   const name = key === 'assigneeAgentId' ? 'ownerAgentId' : key;
   result[name] = ['status','from','to'].includes(key) && field === 'needs_review' ? 'needs_attention' : key === 'type' && field === 'task.needs_review' ? 'task.needs_attention' : convert(field);
  }
  return result;
 };
 return { ...(convert(value) as Record<string, unknown>), schemaVersion: 2, ...(metadata.length ? { legacyEventMetadata: metadata } : {}) };
}
