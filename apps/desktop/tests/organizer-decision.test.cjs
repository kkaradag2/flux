const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');

// Independent test interpreter for the published schema's standard keywords.
function schemaAccepts(schema, value) {
 if (schema.oneOf) return schema.oneOf.filter(branch => schemaAccepts(branch, value)).length === 1;
 if ('const' in schema && value !== schema.const) return false;
 if (schema.type === 'string') return typeof value === 'string' && (!schema.pattern || new RegExp(schema.pattern, 'u').test(value)) && (schema.maxLength === undefined || Array.from(value).length <= schema.maxLength);
 if (schema.type === 'boolean') return typeof value === 'boolean';
 if (schema.type === 'array') return Array.isArray(value) && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity) && (!schema.uniqueItems || !value.some((item, index) => value.slice(0, index).some(previous => JSON.stringify(previous) === JSON.stringify(item)))) && value.every(item => schemaAccepts(schema.items, item));
 if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value) && schema.required.every(key => Object.hasOwn(value, key)) && (schema.additionalProperties !== false || Object.keys(value).every(key => Object.hasOwn(schema.properties, key))) && Object.entries(schema.properties).every(([key, child]) => schemaAccepts(child, value[key]));
 throw new Error('Unsupported schema keyword/type in test interpreter');
}

test('Organizer instruction and decision contract', async t => {
 const root = path.resolve(__dirname, '../../..');
 const parent = path.join(root, '.cache/organizer-decision-tests');
 await fs.mkdir(parent, { recursive: true });
 const base = await fs.mkdtemp(path.join(parent, 'run-'));
 t.after(() => fs.rm(base, { recursive: true, force: true }));
 for (const folder of ['application/orchestration/organizer', 'domain/orchestration']) {
  await fs.mkdir(path.join(base, folder), { recursive: true });
  for (const file of await fs.readdir(path.join(root, 'apps/desktop/src', folder))) {
   if (!file.endsWith('.ts')) continue;
   await fs.writeFile(path.join(base, folder, file.replace(/\.ts$/, '.js')), ts.transpileModule(await fs.readFile(path.join(root, 'apps/desktop/src', folder, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
 }
 const load = name => require(path.join(base, 'application/orchestration/organizer', name + '.js'));
 const { createOrganizerRuntimeContext } = load('OrganizerRuntimeContext');
 const { buildOrganizerInstruction } = load('buildOrganizerInstruction');
 const { parseOrganizerDecision: parse, validateOrganizerDecision: validate } = load('validateOrganizerDecision');
 const { OrganizerDecisionError } = load('OrganizerDecisionError');
 const { organizerDecisionSchema: schema, matchesOrganizerDecisionSchema } = load('organizerDecisionSchema');
 const agents = [
  { id: 'a', name: 'Developer', description: 'Implements changes', runtime: { type: 'codex' }, enabled: true, instructionsMarkdown: 'USER INSTRUCTION: Follow project conventions.' },
  { id: 'b', name: 'Reviewer', description: 'Reviews changes', runtime: { type: 'codex' }, enabled: true, instructionsMarkdown: 'PRIVATE_REVIEWER_INSTRUCTION' },
  { id: 'c', name: 'Tester', description: 'Tests changes', runtime: { type: 'codex' }, enabled: false, instructionsMarkdown: 'PRIVATE_TESTER_INSTRUCTION' },
 ];
 const team = { id: 'team', name: 'Example team', organizerAgentId: 'a', agentIds: ['a', 'b', 'c'] };
 const request = { userRequest: 'Implement a search form', conversationId: 'conversation', projectId: 'project', projectName: 'Flux', branch: 'feature/example' };
 const context = createOrganizerRuntimeContext(team, agents, request);
 const task = (key = 'build', extra = {}) => ({ key, title: 'Build search', description: 'Add the search form', ownerAgentId: 'a', dependsOn: [], acceptanceCriteria: ['Search returns matching results'], ...extra });
 const plan = tasks => ({ type: 'create_plan', message: 'Here is the plan.', planSummary: 'Implement and verify search.', tasks: tasks ?? [task()] });
 const valid = [{ type: 'respond', message: 'This is the answer.' }, { type: 'ask_user', message: 'Please clarify.', questions: ['Which data source?'] }, plan()];
 const rejects = (value, code) => assert.throws(() => parse(typeof value === 'string' ? value : JSON.stringify(value), context), error => error instanceof OrganizerDecisionError && (!code || error.code === code));

 await t.test('composes user instruction and Organizer rules without mutation or other member instructions', () => {
  const before = JSON.stringify({ agents, team, request });
  const instruction = buildOrganizerInstruction(agents[0].instructionsMarkdown, { ...context, unrelatedSecret: 'CONTEXT_SECRET', members: context.members.map(member => ({ ...member, instructionsMarkdown: 'MEMBER_SECRET' })) });
  assert.ok(instruction.includes(agents[0].instructionsMarkdown));
  assert.ok(instruction.includes('Flux Organizer runtime contract'));
  for (const member of context.members) for (const field of ['id', 'name', 'description', 'enabled']) assert.ok(instruction.includes(JSON.stringify(member[field])));
  for (const secret of ['PRIVATE_REVIEWER_INSTRUCTION', 'PRIVATE_TESTER_INSTRUCTION', 'CONTEXT_SECRET', 'MEMBER_SECRET']) assert.ok(!instruction.includes(secret));
  assert.equal(JSON.stringify({ agents, team, request }), before);
  for (const rule of ['respond', 'ask_user', '1–3', 'exactly one owner', 'agent IDs', 'enabled', 'description', 'parallel', 'dependencies', 'over-fragment', 'fake tasks', 'yourself', 'overall work completed', 'only one JSON']) assert.ok(instruction.includes(rule), rule);
 });
 await t.test('context resolves selected Organizer rather than a fixed name or first-member role', () => {
  const other = createOrganizerRuntimeContext({ ...team, organizerAgentId: 'b' }, agents, request);
  assert.equal(other.organizerAgentName, 'Reviewer');
  assert.equal(other.organizerAgentId, 'b');
  assert.throws(() => createOrganizerRuntimeContext({ ...team, organizerAgentId: 'outsider' }, agents, request), error => error.code === 'INVALID_CONTEXT');
 });
 await t.test('all three valid decisions parse and return independent frozen values', () => {
  for (const value of valid) assert.deepEqual(parse(JSON.stringify(value), context), value);
  const source = plan(); const result = validate(source, context);
  source.tasks[0].title = 'Changed';
  assert.equal(result.tasks[0].title, 'Build search');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.tasks[0].dependsOn));
 });
 await t.test('one to three nonempty questions; no tasks in questions or responses', () => {
  validate({ ...valid[1], questions: ['One?', 'Two?', 'Three?'] }, context);
  for (const questions of [[], ['One?', 'Two?', 'Three?', 'Four?'], [' ']]) rejects({ ...valid[1], questions }, 'INVALID_SHAPE');
  rejects({ ...valid[0], tasks: [] }); rejects({ ...valid[1], tasks: [] });
 });
 await t.test('unknown/disabled agents and multiple owners rejected; enabled self assignment allowed', () => {
  for (const ownerAgentId of ['outsider', 'c']) rejects(plan([task('a', { ownerAgentId })]), 'INVALID_ASSIGNEE');
  rejects(plan([task('a', { ownerAgentId: ['a', 'b'] })]));
  rejects(plan([task('a', { owners: ['a', 'b'] })]));
  assert.equal(validate(plan(), context).tasks[0].ownerAgentId, context.organizerAgentId);
 });
 await t.test('duplicate keys, missing/self/duplicate/circular dependencies use domain graph validation', () => {
  for (const tasks of [[task(), task()], [task('a', { dependsOn: ['missing'] })], [task('a', { dependsOn: ['a'] })], [task('a', { dependsOn: ['b'] }), task('b', { dependsOn: ['a'] })]]) rejects(plan(tasks), 'INVALID_DEPENDENCIES');
  rejects(plan([task('a'), task('b', { dependsOn: ['a', 'a'] })]), 'INVALID_SHAPE');
 });
 await t.test('parallel tasks and forward dependency references accepted without reordering', () => {
  for (const tasks of [[task('a'), task('b')], [task('a', { dependsOn: ['b'] }), task('b')]]) assert.deepEqual(validate(plan(tasks), context).tasks, tasks);
 });
 await t.test('nonempty fields, criteria, local key format and task limits', () => {
  rejects(plan([])); rejects(plan(Array.from({ length: 51 }, (_, i) => task('task-' + i))));
  assert.equal(validate(plan(Array.from({ length: 50 }, (_, i) => task('task-' + i))), context).tasks.length, 50);
  for (const change of [{ title: '' }, { description: ' \n' }, { key: 'key with spaces' }, { key: 'x'.repeat(49) }, { acceptanceCriteria: ['x', 'x'] }, { acceptanceCriteria: [' '] }, { acceptanceCriteria: [] }, { acceptanceCriteria: ['x'.repeat(501)] }, { acceptanceCriteria: Array.from({length:13},(_,i)=>String(i)) }, { requiresReview: 'true' }]) rejects(plan([task('a', change)]));
  rejects({ ...plan(), message: ' ' }); rejects({ ...plan(), planSummary: '' });
 });
 await t.test('missing and extra fields rejected at every union branch and task level', () => {
  for (const value of valid) {
   for (const key of Object.keys(value)) { const incomplete = { ...value }; delete incomplete[key]; rejects(incomplete); }
   rejects({ ...value, extra: 'not permitted' });
  }
  for (const key of Object.keys(task())) { const incomplete = task(); delete incomplete[key]; rejects(plan([incomplete])); }
  rejects(plan([task('a', { extra: true })])); rejects({ type: 'finish', message: 'done' });
 });
 await t.test('free text and malformed JSON rejected without exposing raw model data', () => {
  for (const output of ['SECRET_TOKEN not JSON', '```json\n{"type":"respond","message":"x"}\n```', '{"SECRET_TOKEN":', JSON.stringify({ ...valid[0], secret: 'SECRET_TOKEN' }), JSON.stringify('SECRET_TOKEN')]) {
   assert.throws(() => parse(output, context), error => error instanceof OrganizerDecisionError && !error.message.includes('SECRET_TOKEN') && !JSON.stringify(error).includes('SECRET_TOKEN'));
  }
 });
 await t.test('published JSON schema and runtime agree on structural examples; semantic checks remain explicit', () => {
  const examples = [...valid, null, [], true, { type: 'unknown' }, { ...valid[0], tasks: [] }, { ...valid[1], questions: [] }, { ...valid[1], questions: ['1', '2', '3', '4'] }, plan([]), plan([task('x', { requiresReview: 1 })]), plan([task('x', { acceptanceCriteria: ['same', 'same'] })])];
  for (const value of examples) {
   const expected = schemaAccepts(schema, value);
   assert.equal(matchesOrganizerDecisionSchema(value), expected);
   let actual = true; try { validate(value, context); } catch { actual = false; }
   assert.equal(actual, expected);
  }
  // Membership/cycles cannot be represented by this static structural schema.
  assert.equal(schemaAccepts(schema, plan([task('x', { ownerAgentId: 'outsider' })])), true);
  rejects(plan([task('x', { ownerAgentId: 'outsider' })]), 'INVALID_ASSIGNEE');
  function inspect(node) {
   if (node.type === 'object') { assert.equal(node.additionalProperties, false); assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort()); Object.values(node.properties).forEach(inspect); }
   if (node.items) inspect(node.items);
   if (node.oneOf) node.oneOf.forEach(inspect);
  }
  inspect(schema);
  assert.ok(Object.isFrozen(schema));
 });
});
