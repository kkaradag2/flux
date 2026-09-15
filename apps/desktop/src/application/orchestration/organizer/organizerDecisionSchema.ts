import type { OrganizerDecision, OrganizerPlanTask } from './OrganizerDecision';

export type DecisionSchema =
  | Readonly<{ type: 'string'; pattern?: string; maxLength?: number; const?: string }>
  | Readonly<{ type: 'boolean' }>
  | Readonly<{ type: 'array'; items: DecisionSchema; minItems?: number; maxItems?: number; uniqueItems?: boolean }>
  | Readonly<{ type: 'object'; properties: Readonly<Record<string, DecisionSchema>>; required: readonly string[]; additionalProperties: false }>;

function object<T>(properties: { [K in keyof T]-?: DecisionSchema }): DecisionSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
const text: DecisionSchema = { type: 'string', pattern: '\\S' };
const key: DecisionSchema = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$', maxLength: 48 };
const task = object<OrganizerPlanTask>({ key, title: text, description: text, assigneeAgentId: text,
  dependsOn: { type: 'array', items: key, maxItems: 49, uniqueItems: true },
  acceptanceCriteria: { type: 'array', items: text, minItems: 1, uniqueItems: true }, requiresReview: { type: 'boolean' } });

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const organizerDecisionSchema = freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  oneOf: [
    object<Extract<OrganizerDecision, { type: 'respond' }>>({ type: { type: 'string', const: 'respond' }, message: text }),
    object<Extract<OrganizerDecision, { type: 'ask_user' }>>({ type: { type: 'string', const: 'ask_user' }, message: text, questions: { type: 'array', items: text, minItems: 1, maxItems: 3 } }),
    object<Extract<OrganizerDecision, { type: 'create_plan' }>>({ type: { type: 'string', const: 'create_plan' }, message: text, planSummary: text, tasks: { type: 'array', items: task, minItems: 1, maxItems: 50 } }),
  ],
});

// This small evaluator implements only the keywords emitted above, not arbitrary external schemas.
function matches(value: unknown, schema: DecisionSchema): boolean {
  switch (schema.type) {
    case 'string': return typeof value === 'string' && (schema.const === undefined || value === schema.const) && (schema.maxLength === undefined || [...value].length <= schema.maxLength) && (!schema.pattern || new RegExp(schema.pattern, 'u').test(value));
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value) && (schema.minItems === undefined || value.length >= schema.minItems) && (schema.maxItems === undefined || value.length <= schema.maxItems) && (!schema.uniqueItems || new Set(value.map(item => JSON.stringify(item))).size === value.length) && value.every(item => matches(item, schema.items));
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const row = value as Record<string, unknown>;
      return schema.required.every(key => Object.hasOwn(row, key)) && Object.keys(row).every(key => Object.hasOwn(schema.properties, key)) && Object.entries(schema.properties).every(([key, shape]) => matches(row[key], shape));
    }
  }
}
export function matchesOrganizerDecisionSchema(value: unknown): value is OrganizerDecision {
  return organizerDecisionSchema.oneOf.filter(schema => matches(value, schema)).length === 1;
}
