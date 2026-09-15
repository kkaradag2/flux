const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.cache/worktree-tests', String(Date.now()));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, shell: false }).trim();

test('Conversation worktree isolation', async t => {
  for (const directory of ['main/chat', 'main/projects', 'main/management', 'main/app-server', 'shared']) {
    await fs.mkdir(path.join(base, directory), { recursive: true });
    for (const file of await fs.readdir(path.join(root, 'apps/desktop/src', directory))) {
      if (!file.endsWith('.ts') || file.startsWith('register')) continue;
      const source = await fs.readFile(path.join(root, 'apps/desktop/src', directory, file), 'utf8');
      await fs.writeFile(path.join(base, directory, file.replace(/\.ts$/, '.js')), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
    }
  }
  const { ConversationWorktreeService } = require(path.join(base, 'main/chat/ConversationWorktreeService'));
  const { GitCommandRunner } = require(path.join(base, 'main/projects/GitCommandRunner'));
  const { ConversationRepository, conversationDetail } = require(path.join(base, 'main/chat/ConversationRepository'));
  const { SingleAgentRunService } = require(path.join(base, 'main/chat/SingleAgentRunService'));
  const repository = path.join(base, 'repository'); await fs.mkdir(repository);
  git(repository, 'init', '-b', 'primary');
  await fs.writeFile(path.join(repository, 'source.txt'), 'committed source\n'); git(repository, 'add', 'source.txt');
  // Fixture repository only; the Flux repository is never committed by tests.
  git(repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  git(repository, 'branch', 'alternate');
  await fs.writeFile(path.join(repository, 'source.txt'), 'uncommitted primary source\n');
  const originalHead = git(repository, 'rev-parse', 'HEAD'), originalStatus = git(repository, 'status', '--porcelain');
  const storage = path.join(base, 'app-data/worktrees');
  const commands = new GitCommandRunner();
  const service = new ConversationWorktreeService(storage);
  const draft = () => ({ id: randomUUID(), projectId: 'fixture', branchName: 'alternate' });
  const snapshots = [];
  const save = value => async () => { snapshots.push(structuredClone(value)); };

  await t.test('non-HEAD local branch creates an isolated branch, atomic metadata precedes use, restart reuses tree', async () => {
    const value = draft(), directory = await service.ensure(value, repository, save(value));
    assert.equal(value.baseBranch, 'alternate'); assert.match(value.workBranch, /^flux\/[a-f0-9]{16}$/);
    assert.equal(value.worktreeStatus, 'ready'); assert.ok(value.worktreeCreatedAt);
    assert.equal(directory, path.join(storage, value.projectId, value.id));
    assert.ok(snapshots.some(snapshot => snapshot.worktreeStatus === 'creating'));
    assert.equal(git(directory, 'branch', '--show-current'), value.workBranch);
    assert.equal(await fs.readFile(path.join(directory, 'source.txt'), 'utf8'), 'committed source\n');
    const restart = new ConversationWorktreeService(storage);
    assert.ok(await restart.inspect(value, repository));
    assert.equal(await restart.ensure(value, repository, save(value)), directory);
    assert.equal(git(repository, 'branch', '--show-current'), 'primary');
    assert.equal(git(repository, 'rev-parse', 'HEAD'), originalHead);
    assert.equal(git(repository, 'status', '--porcelain'), originalStatus);
  });
  await t.test('repository lock serializes concurrent creates even through a linked checkout', async () => {
    let active = 0, max = 0;
    const runner = { run: async (cwd, args, timeout) => {
      const create = args[0] === 'update-ref' && args.length === 4;
      if (create) { active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 30)); }
      try { return await commands.run(cwd, args, timeout); } finally { if (create) active--; }
    } };
    const locked = new ConversationWorktreeService(storage, runner);
    const first = draft(); const linked = await locked.ensure(first, repository, save(first));
    const values = [draft(), draft()]; await Promise.all(values.map((value, index) => locked.ensure(value, index ? linked : repository, save(value))));
    assert.equal(max, 1); assert.notEqual(values[0].workBranch, values[1].workBranch);
  });
  await t.test('invalid or remote base branch never launches a mutation', async () => {
    for (const branch of ['origin/alternate', '--orphan', 'alternate; touch unsafe']) {
      const value = { ...draft(), branchName: branch };
      await assert.rejects(service.ensure(value, repository, save(value)), { code: 'BASE_BRANCH_UNAVAILABLE' });
    }
  });
  await t.test('failed add cleans only the reserved branch and leaves a user branch untouched', async () => {
    const runner = { run: (cwd, args, timeout) => {
      if (args[0] === 'worktree' && args[1] === 'add') return Promise.reject(Error('raw secret failure'));
      return commands.run(cwd, args, timeout);
    } };
    const value = draft();
    await assert.rejects(new ConversationWorktreeService(storage, runner).ensure(value, repository, save(value)), { code: 'WORKTREE_FAILED' });
    assert.equal(value.worktreeStatus, 'failed');
    assert.equal(git(repository, 'for-each-ref', '--format=%(refname)', 'refs/heads/' + value.workBranch), '');
    assert.equal(git(repository, 'rev-parse', 'alternate'), originalHead);
    // Same short ID collision must never delete a pre-existing ref.
    git(repository, 'branch', value.workBranch, 'alternate');
    await assert.rejects(service.ensure(value, repository, save(value)), { code: 'WORKTREE_FAILED' });
    assert.equal(git(repository, 'rev-parse', value.workBranch), originalHead);
  });
  await t.test('partial successful add cleanup is conservative and never deletes changed files', async () => {
    for (const dirty of [false, true]) {
      const value = draft();
      const runner = { run: async (cwd, args, timeout) => {
        const output = await commands.run(cwd, args, timeout);
        if (args[0] === 'worktree' && args[1] === 'add') {
          if (dirty) await fs.writeFile(path.join(value.worktreePath, 'source.txt'), 'preserve this\n');
          throw Error('post-add failure');
        }
        return output;
      } };
      await assert.rejects(new ConversationWorktreeService(storage, runner).ensure(value, repository, save(value)));
      if (dirty) assert.equal(await fs.readFile(path.join(value.worktreePath, 'source.txt'), 'utf8'), 'preserve this\n');
      else { await assert.rejects(fs.stat(value.worktreePath)); assert.equal(git(repository, 'for-each-ref', '--format=%(refname)', 'refs/heads/' + value.workBranch), ''); }
    }
  });
  await t.test('missing/retargeted trees fail closed; no silent recreation; altered path is rejected', async () => {
    const value = draft(); await service.ensure(value, repository, save(value));
    const other = { ...value, worktreePath: repository };
    await assert.rejects(service.ensure(other, repository, save(other)), { code: 'WORKTREE_MISSING' });
    git(value.worktreePath, 'switch', '--detach');
    assert.equal(await service.inspect(value, repository), false);
    await assert.rejects(service.ensure(value, repository, save(value)), { code: 'WORKTREE_MISSING' });
    assert.equal(value.worktreeStatus, 'missing');
    assert.equal(git(value.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD');
    await assert.rejects(new ConversationWorktreeService(path.join(repository, 'forbidden')).ensure(draft(), repository, async () => {}));
    await assert.rejects(service.ensure({ ...draft(), projectId: '../outside' }, repository, async () => {}));
  });
  await t.test('durable creating record recovers after final save failure without duplicate tree', async () => {
    const value = draft(); let durable;
    await assert.rejects(service.ensure(value, repository, async () => { if (value.worktreeStatus === 'ready') throw Error('disk failure'); durable = structuredClone(value); }));
    assert.equal(durable.worktreeStatus, 'creating');
    assert.equal(await service.ensure(durable, repository, save(durable)), value.worktreePath);
    assert.equal(durable.worktreeStatus, 'ready');
  });
  await t.test('Windows-style AppData virtualization uses the canonical root, never the primary checkout', async () => {
    const requested = path.join(base, 'virtual-app-data'), canonical = path.join(base, 'physical-app-data');
    await fs.mkdir(canonical); const original = fs.realpath;
    try {
      fs.realpath = async directory => path.resolve(directory) === requested ? canonical : original(directory);
      const value = draft(); const redirected = new ConversationWorktreeService(requested);
      const directory = await redirected.ensure(value, repository, save(value));
      assert.equal(directory, path.join(canonical, value.projectId, value.id));
      assert.ok(await redirected.inspect(value, repository));
      fs.realpath = async directory => path.resolve(directory) === requested ? repository : original(directory);
      await assert.rejects(redirected.ensure(draft(), repository, async () => {}), { code: 'WORKTREE_FAILED' });
    } finally { fs.realpath = original; }
  });
  await t.test('symlinked project storage is rejected without touching its destination', async () => {
    const target = path.join(base, 'preserved-directory'), link = path.join(storage, 'redirected');
    await fs.mkdir(target); await fs.writeFile(path.join(target, 'keep.txt'), 'keep');
    await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(service.ensure({ ...draft(), projectId: 'redirected' }, repository, async () => {}), { code: 'WORKTREE_FAILED' });
    assert.deepEqual(await fs.readdir(target), ['keep.txt']);
  });
  await t.test('legacy follow-up preserves thread, uses migrated cwd; restart and missing tree gate model', async () => {
    const now = new Date().toISOString(), value = draft();
    const agent = { id: 'lead', name: 'Lead', description: 'Lead', avatar: { type: 'builtin', value: 'robot' }, runtime: { type: 'codex', model: null, reasoningEffort: 'default' }, instructionsMarkdown: 'read only', enabled: true, createdAt: now, updatedAt: now };
    Object.assign(value, { teamId: 'core-team', leadAgentId: 'lead', codexThreadId: 'legacy-thread', title: 'Legacy', status: 'completed', interrupted: false, createdAt: now, updatedAt: now, messages: [], agentDefinition: agent, agentSnapshot: { id: 'lead', name: 'Lead', avatar: agent.avatar } });
    const records = new ConversationRepository(path.join(base, 'app-data/conversations')); await records.save(value);
    const calls = [], events = [];
    const create = () => new SingleAgentRunService({ getProjects: async () => [{ id: 'fixture', path: repository }] }, { getAgents: async () => [agent] }, { getTeam: async () => ({ id: 'core-team', agentIds: ['lead'] }) }, { snapshot: () => ({ activity: null, state: { operationalStatus: 'READY', verificationStatus: 'passed', installationId: 'test' } }) }, () => ({ close: async () => {}, turn: async options => { calls.push(options); return 'Hello'; } }), records, new ConversationWorktreeService(storage));
    const turn = async run => { events.length = 0; run.start(1, { projectId: 'fixture', branch: 'alternate', teamId: 'core-team', prompt: 'hello' }, event => events.push(event)); for (let i = 0; i < 1000; i++) { if (events.some(event => ['completed', 'failed'].includes(event.type))) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('turn timeout'); };
    let run = create(); await run.open(1, value.id); await turn(run); assert.equal(events.at(-1).type, 'completed'); await run.shutdown();
    const saved = await records.get(value.id); assert.equal(saved.worktreeStatus, 'ready');
    assert.equal(calls[0].cwd, saved.worktreePath); assert.equal(calls[0].threadId, 'legacy-thread');
    assert.ok(!('worktreePath' in conversationDetail(saved)));
    run = create(); await run.open(1, value.id); await turn(run); await run.shutdown();
    assert.equal(calls[1].cwd, calls[0].cwd); assert.equal(calls[1].threadId, 'legacy-thread');
    git(repository, 'worktree', 'remove', saved.worktreePath);
    run = create(); const opened = await run.open(1, value.id); assert.equal(opened.conversation.worktreeStatus, 'missing');
    await turn(run); assert.equal(events.at(-1).code, 'WORKTREE_MISSING'); assert.equal(calls.length, 2); await run.shutdown();
  });
  assert.equal(git(repository, 'branch', '--show-current'), 'primary');
  assert.equal(git(repository, 'rev-parse', 'HEAD'), originalHead);
  assert.equal(git(repository, 'status', '--porcelain'), originalStatus);
});
