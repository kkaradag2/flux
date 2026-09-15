const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.cache/conversation-history-tests', String(Date.now()));

test('Persistent conversation history', async t => {
  for (const directory of ['main/app-server', 'main/chat', 'main/management', 'shared']) {
    await fs.mkdir(path.join(base, directory), { recursive: true });
    for (const file of await fs.readdir(path.join(root, 'apps/desktop/src', directory))) {
      if (!file.endsWith('.ts') || file.startsWith('register')) continue;
      const source = await fs.readFile(path.join(root, 'apps/desktop/src', directory, file), 'utf8');
      await fs.writeFile(path.join(base, directory, file.replace(/\.ts$/, '.js')), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
    }
  }
  const { ConversationRepository, conversationTitle, conversationDetail } = require(path.join(base, 'main/chat/ConversationRepository'));
  const { ConversationCheckpoint } = require(path.join(base, 'main/chat/ConversationCheckpoint'));
  const { SingleAgentRunService } = require(path.join(base, 'main/chat/SingleAgentRunService'));
  const { CodexChatSession, ChatThreadUnavailableError } = require(path.join(base, 'main/app-server/CodexChatSession'));
  const now = '2026-09-15T12:00:00.000Z';
  const agent = { id: 'lead', name: 'Original Lead', description: 'Lead', avatar: { type: 'builtin', value: 'robot' }, runtime: { type: 'codex', model: null, reasoningEffort: 'default' }, instructionsMarkdown: 'Original instructions', enabled: true, createdAt: now, updatedAt: now };
  const input = { projectId: 'flux', branch: 'feature/single-agent-chat', teamId: 'core-team', prompt: 'First prompt\nwith whitespace' };
  const record = (overrides = {}) => ({ id: randomUUID(), projectId: 'flux', branchName: input.branch, teamId: 'core-team', leadAgentId: 'lead', title: 'First prompt', codexThreadId: 'thread-saved', status: 'completed', interrupted: false, createdAt: now, updatedAt: now,
    agentDefinition: structuredClone(agent), agentSnapshot: { id: agent.id, name: agent.name, avatar: structuredClone(agent.avatar) }, messages: [{ id: randomUUID(), role: 'agent', content: 'Partial answer', agentId: 'lead', createdAt: now, status: 'completed' }], ...overrides });
  const until = async predicate => { for (let i = 0; i < 500; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('condition timed out'); };
  const repo = () => new ConversationRepository(path.join(base, 'records', randomUUID()));
  function fixture(repository = repo(), mode = 'complete', currentAgent = agent) {
    const calls = [], events = []; let finish, writesBeforeLaunch = false;
    const service = new SingleAgentRunService({ getProjects: async () => [{ id: 'flux', path: root }], getCurrentBranch: async () => input.branch }, { getAgents: async () => [currentAgent] }, { getTeam: async () => ({ id: 'core-team', agentIds: ['lead'] }) },
      { snapshot: () => ({ activity: null, state: { operationalStatus: 'READY', verificationStatus: 'passed', installationId: 'verified' } }) }, () => ({
        turn: async (options, prompt, signal, onText) => {
          const saved = (await repository.list())[0];
          assert.equal(saved.messages.at(-2).role, 'user'); assert.equal(saved.messages.at(-2).content, prompt); writesBeforeLaunch = true;
          calls.push({ threadId: options.threadId, instructions: options.instructions, runtime: options.runtime });
          if (mode === 'missing') throw new ChatThreadUnavailableError();
          await options.onThread(options.threadId ?? 'thread-original');
          assert.equal((await repository.get(saved.id)).codexThreadId, options.threadId ?? 'thread-original');
          onText('answer', 'partial');
          if (mode === 'hold') return new Promise(resolve => { finish = resolve; signal.addEventListener('abort', () => resolve(''), { once: true }); });
          if (mode === 'failed') throw new Error('secret protocol stderr');
          onText('answer', 'Completed answer'); return 'Completed answer';
        }, close: async () => {},
      }), repository, 10000);
    return { service, repository, calls, events, finish: value => finish(value), written: () => writesBeforeLaunch,
      send: (data = input) => service.start(1, data, event => events.push(event)),
      done: async () => until(() => events.some(event => ['completed', 'failed', 'cancelled'].includes(event.type))) };
  }
  await t.test('New task creates no empty record; deterministic one-line titles need no model', async () => {
    const f = fixture(); await f.service.reset(1); assert.deepEqual(await f.repository.list(), []);
    assert.equal(conversationTitle('  hello\n\tworld  '), 'hello world');
    assert.equal(Array.from(conversationTitle('😀'.repeat(100))).length, 60); assert.equal(conversationTitle('x'.repeat(100)).length, 60);
  });
  await t.test('user and thread ID saved before execution; final messages ordered and persisted', async () => {
    const f = fixture(); const ids = f.send(); await f.done(); const value = await f.repository.get(ids.conversationId);
    assert.equal(f.written(), true); assert.equal(value.title, 'First prompt with whitespace');
    assert.equal(value.codexThreadId, 'thread-original'); assert.equal(value.status, 'completed');
    assert.deepEqual(value.messages.map(message => [message.role, message.status]), [['user', 'completed'], ['agent', 'completed']]);
    assert.equal(value.messages[1].content, 'Completed answer');
    assert.equal(f.events.at(-1).conversation.id, ids.conversationId);
    const publicData = conversationDetail(value); assert.ok(!('codexThreadId' in publicData)); assert.ok(!('agentDefinition' in publicData));
    await f.service.shutdown();
  });
  await t.test('restart reopens messages and resumes saved identity with immutable agent snapshot', async () => {
    const store = repo(), first = fixture(store); const ids = first.send(); await first.done(); await first.service.shutdown();
    const second = fixture(store, 'complete', { ...agent, name: 'Renamed Lead', instructionsMarkdown: 'Changed instructions', avatar: { type: 'builtin', value: 'code' } });
    const opened = await second.service.open(1, ids.conversationId); assert.equal(opened.conversation.agentSnapshot.name, 'Original Lead');
    assert.equal(opened.conversation.messages.length, 2); assert.equal(opened.activeRun, null);
    second.send({ ...input, prompt: 'follow-up' }); await second.done();
    assert.equal(second.calls[0].threadId, 'thread-original'); assert.equal(second.calls[0].instructions, 'Original instructions');
    assert.equal((await store.get(ids.conversationId)).messages.length, 4); await second.service.shutdown();
  });
  await t.test('failed and cancelled outcomes preserve partial text and safe system messages', async () => {
    for (const mode of ['failed', 'hold']) {
      const f = fixture(undefined, mode); const id = f.send().conversationId;
      await until(() => f.calls.length > 0); if (mode === 'hold') { await until(() => f.events.some(e => e.type === 'messageDelta')); await f.service.cancel(1); }
      await f.done(); const value = await f.repository.get(id), status = mode === 'failed' ? 'failed' : 'cancelled';
      assert.equal(value.status, status); assert.equal(value.messages[1].content, 'partial'); assert.equal(value.messages[1].status, status);
      assert.equal(value.messages.at(-1).role, 'system'); assert.ok(!JSON.stringify(value).includes('secret'));
      await f.service.shutdown();
    }
  });
  await t.test('active record reopening is not interrupted; other conversations cannot hijack workspace', async () => {
    const f = fixture(undefined, 'hold'); const ids = f.send(); await until(() => f.events.some(e => e.type === 'messageDelta'));
    const open = await f.service.open(1, ids.conversationId); assert.equal(open.conversation.status, 'running'); assert.deepEqual(open.activeRun, ids);
    await assert.rejects(f.service.open(2, ids.conversationId), /already running/);
    await f.service.cancel(1); f.events.length = 0;
    f.send({ ...input, projectId: 'another-project' }); await f.done(); assert.equal(f.events.at(-1).code, 'CONTEXT_CHANGED');
    assert.equal((await f.repository.get(ids.conversationId)).messages.filter(m => m.role === 'user').length, 1);
    await f.service.shutdown();
  });
  await t.test('orphaned running partial survives restart and is marked Interrupted exactly once', async () => {
    const store = repo(); const value = record({ status: 'running' }); value.messages[0].status = 'streaming'; await store.save(value);
    await store.recoverInterrupted(); await store.recoverInterrupted(); const recovered = await store.get(value.id);
    assert.equal(recovered.interrupted, true); assert.equal(recovered.status, 'failed'); assert.equal(recovered.messages[0].content, 'Partial answer');
    assert.equal(recovered.messages[0].status, 'failed'); assert.equal(recovered.messages.length, 2); assert.match(recovered.messages[1].content, /Interrupted/);
  });
  await t.test('checkpoints coalesce tokens, snapshot in-flight writes and flush final state last', async () => {
    let value = record({ status: 'running' }), calls = [], release;
    const store = { save: async snapshot => { calls.push(snapshot); if (calls.length === 1) await new Promise(resolve => { release = resolve; }); } };
    const checkpoint = new ConversationCheckpoint(store, () => value, () => assert.fail('checkpoint failed'), 20);
    for (let i = 0; i < 100; i++) { value.messages[0].content = String(i); checkpoint.changed(); }
    await until(() => calls.length === 1); assert.equal(calls[0].messages[0].content, '99');
    value.messages[0].content = 'final'; value.status = 'completed'; checkpoint.changed(); const final = checkpoint.flush();
    assert.equal(calls.length, 1); release(); await final; assert.equal(calls.length, 2); assert.equal(calls[1].status, 'completed'); assert.equal(calls[1].messages[0].content, 'final');
  });
  await t.test('atomic replacement failure preserves existing JSON and cleans temporary file', async () => {
    const directory = path.join(base, 'atomic'), store = new ConversationRepository(directory), value = record(); await store.save(value);
    const file = path.join(directory, value.id + '.json'), original = await fs.readFile(file, 'utf8'), rename = fs.rename;
    try { fs.rename = async () => { throw Error('rename failed'); }; await assert.rejects(store.save({ ...value, title: 'changed' }), /preserved/); }
    finally { fs.rename = rename; }
    assert.equal(await fs.readFile(file, 'utf8'), original); assert.deepEqual(await fs.readdir(directory), [value.id + '.json']);
  });
  await t.test('malformed history and traversal IDs rejected without overwriting saved files', async () => {
    const directory = path.join(base, 'invalid'), store = new ConversationRepository(directory); await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, randomUUID() + '.json'); await fs.writeFile(file, '{bad');
    await assert.rejects(store.list()); assert.equal(await fs.readFile(file, 'utf8'), '{bad');
    for (const id of ['../outside', 'C:\\outside', '', { id: randomUUID() }]) await assert.rejects(store.get(id));
  });
  await t.test('missing registered thread returns safe failure, retains history and never chooses a new ID', async () => {
    const store = repo(), saved = record(); await store.save(saved); const f = fixture(store, 'missing');
    await f.service.open(1, saved.id); f.send(); await f.done();
    assert.equal(f.calls[0].threadId, 'thread-saved'); assert.equal(f.events.at(-1).code, 'THREAD_UNAVAILABLE');
    assert.equal((await store.get(saved.id)).codexThreadId, 'thread-saved'); await f.service.shutdown();
  });
  await t.test('thread/resume uses only saved ID, repeats sandbox protections, saves ID before turn', async () => {
    for (const missing of [false, true]) {
      const sent = [], listeners = new Set(); let savedBeforeTurn = false, closed = 0;
      const wire = {
        request: async (method, params) => {
          sent.push({ method, params });
          if (method === 'initialize') return { userAgent: 'codex' };
          if (method === 'mcpServerStatus/list') return { data: [], nextCursor: null };
          if (method === 'thread/resume') { if (missing) throw Error('secret missing thread'); return { thread: { id: 'thread-saved' }, approvalPolicy: 'never', sandbox: { type: 'readOnly', networkAccess: false } }; }
          if (method === 'turn/start') { assert.ok(savedBeforeTurn); queueMicrotask(() => listeners.forEach(listener => listener({ method: 'turn/completed', params: { threadId: 'thread-saved', turn: { id: 'turn', status: 'completed', items: [{ type: 'agentMessage', id: 'answer', text: 'continued', phase: 'final_answer' }] } } }))); return { turn: { id: 'turn' } }; }
          assert.fail('Unexpected method ' + method);
        }, notify: async method => sent.push({ method }), onNotification: listener => { listeners.add(listener); return () => listeners.delete(listener); }, onRequest: () => () => {}, onFailure: () => () => {}, close: async () => { closed++; },
      };
      const client = new CodexChatSession(async () => wire);
      const pending = client.turn({ cwd: root, instructions: 'saved', runtime: agent.runtime, threadId: 'thread-saved', onThread: async id => { assert.equal(id, 'thread-saved'); savedBeforeTurn = true; } }, 'follow-up', new AbortController().signal, () => {});
      if (missing) { await assert.rejects(pending, ChatThreadUnavailableError); assert.equal(closed, 1); } else { assert.equal(await pending, 'continued'); await client.close(); }
      assert.ok(!sent.some(call => call.method === 'thread/start')); const resume = sent.find(call => call.method === 'thread/resume').params;
      assert.equal(resume.threadId, 'thread-saved'); assert.equal(resume.sandbox, 'read-only'); assert.equal(resume.approvalPolicy, 'never');
      assert.ok(!('path' in resume) && !('history' in resume)); assert.equal(listeners.size, 0);
    }
  });
});
