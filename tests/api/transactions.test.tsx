import { spawnSync } from 'node:child_process';
import { db, ids, reset, login, as, error } from './support';

beforeEach(reset);
afterAll(() => db.$disconnect());

async function withRejectingTrigger(table, operation, action) {
  const name = `test_reject_${table}`;
  await db.$executeRawUnsafe(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ${table} failure'; END; $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER ${name} BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`,
  );
  try {
    await action();
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`);
  }
}

test('FLOW-08 RUN-05: failed answer write rolls back the task and every owned row', async () => {
  const alice = await login();
  const before = await db.task.count();
  await withRejectingTrigger('task_field_values', 'INSERT', async () => {
    const created = await as(alice)
      .post(`/v1/lists/${ids.backlog}/tasks`)
      .send({
        title: 'Rollback candidate',
        statusKey: 'todo',
        customFields: { effort: 1, work_type: '00000000-0000-4000-8000-000000000301' },
      });
    error(created, 500, 'INTERNAL_ERROR');
  });
  expect(await db.task.count()).toBe(before);
  expect(await db.task.count({ where: { title: 'Rollback candidate' } })).toBe(0);
});

test('FLOW-13: member private-container creation rolls back when creator grant fails', async () => {
  const bob = await login('bob');
  await withRejectingTrigger('container_grants', 'INSERT', async () => {
    error(
      await as(bob).post('/v1/containers').send({
        parentId: null,
        type: 'space',
        name: 'Uncommitted private space',
        visibility: 'private',
      }),
      500,
      'INTERNAL_ERROR',
    );
  });
  expect(await db.container.count({ where: { name: 'Uncommitted private space' } })).toBe(0);
});

test('RUN-03: failed demo seed is atomic and can be retried', async () => {
  await db.$executeRawUnsafe('TRUNCATE TABLE workspaces, users, seed_markers CASCADE');
  await withRejectingTrigger('tasks', 'INSERT', async () => {
    const seed = spawnSync('node_modules/.bin/tsx', ['apps/api/prisma/seed.ts'], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(seed.status).not.toBe(0);
    expect(await db.workspace.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
    expect((await db.$queryRawUnsafe<unknown[]>('SELECT * FROM seed_markers')).length).toBe(0);
  });
  const retry = spawnSync('node_modules/.bin/tsx', ['apps/api/prisma/seed.ts'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 30000,
  });
  expect(retry.status).toBe(0);
  expect(await db.task.count()).toBe(24);
});

test('RUN-07: non-demo seed is rejected and missing signing material fails closed', async () => {
  const nonDemo = spawnSync('node_modules/.bin/tsx', ['apps/api/prisma/seed.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, FLOWBOARD_DEMO_MODE: 'false' },
    encoding: 'utf8',
    timeout: 30000,
  });
  expect(nonDemo.status).not.toBe(0);
  expect(nonDemo.stderr).toContain('Demo seed is disabled');
  const noKey = spawnSync(
    'node_modules/.bin/tsx',
    ['-e', "import { config } from './apps/api/src/persistence/runtime.config.ts'; config()"],
    {
      cwd: process.cwd(),
      env: { ...process.env, JWT_SECRET: '', JWT_SECRET_FILE: '' },
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  expect(noKey.status).not.toBe(0);
  expect(noKey.stderr).toContain('JWT signing material is missing');
});

test('FLOW-06 FLOW-11: concurrent task edit and status removal serialize to a valid result', async () => {
  const alice = await login();
  const space = await as(alice)
    .post('/v1/containers')
    .send({ parentId: null, type: 'space', name: 'Race space' });
  const folder = await as(alice)
    .post('/v1/containers')
    .send({ parentId: space.body.id, type: 'folder', name: 'Race folder' });
  const list = await as(alice)
    .post('/v1/containers')
    .send({ parentId: folder.body.id, type: 'list', name: 'Race list' });
  const full = [
    { key: 'todo', name: 'Todo', category: 'not_started', color: '#111111' },
    { key: 'building', name: 'Building', category: 'active', color: '#222222' },
    { key: 'review', name: 'Review', category: 'active', color: '#333333' },
    { key: 'done', name: 'Done', category: 'done', color: '#444444' },
  ];
  await as(alice)
    .put(`/v1/containers/${list.body.id}/status-set`)
    .send({ statuses: full })
    .expect(200);
  const task = await as(alice)
    .post(`/v1/lists/${list.body.id}/tasks`)
    .send({ title: 'Race task', statusKey: 'todo' });
  expect(task.status).toBe(201);
  const [edited, configured] = await Promise.all([
    as(alice)
      .patch(`/v1/tasks/${task.body.id}`)
      .send({ expectedVersion: task.body.version, statusKey: 'building' }),
    as(alice)
      .put(`/v1/containers/${list.body.id}/status-set`)
      .send({ statuses: full.filter((row) => row.key !== 'building') }),
  ]);
  expect([edited.status, configured.status].filter((status) => status === 200)).toHaveLength(1);
  expect(
    [edited.status, configured.status].filter((status) => status === 400 || status === 409),
  ).toHaveLength(1);
  const board = (await as(alice).get(`/v1/lists/${list.body.id}/board`)).body;
  const saved = board.items.find((row) => row.id === task.body.id);
  expect(board.statuses.some((row) => row.key === saved.statusKey)).toBe(true);
});
