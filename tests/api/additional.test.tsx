import { execFileSync } from 'node:child_process';
import request from 'supertest';
import type { BoardResponse } from '@flowboard/contracts';
import { api, db, id, ids, reset, login, as, error } from './support';

beforeEach(reset);
afterAll(() => db.$disconnect());

describe('HTTP contracts and release boundaries', () => {
  test('API-01: web proxy and direct API use the same versioned login and task contract', async () => {
    const web = request(process.env.WEB_URL || 'http://localhost:8080');
    const actor = await login();
    const direct = await as(actor).get(`/v1/tasks/${ids.firstBacklogTask}`);
    const proxied = await web
      .get(`/v1/tasks/${ids.firstBacklogTask}`)
      .set('Authorization', `Bearer ${actor.token}`);
    expect(direct.status).toBe(200);
    expect(proxied.status).toBe(200);
    expect(proxied.body).toEqual(direct.body);
  });

  test('API-06: published OpenAPI paths match exercised core routes', async () => {
    const spec = await api.get('/docs-json');
    expect(spec.status).toBe(200);
    for (const [path, verb] of [
      ['/v1/auth/login', 'post'],
      ['/v1/auth/refresh', 'post'],
      ['/v1/me', 'get'],
      ['/v1/tree', 'get'],
      ['/v1/lists/{id}/board', 'get'],
      ['/v1/tasks/{id}', 'patch'],
      ['/v1/tasks/{id}/move', 'post'],
      ['/v1/containers/{id}/status-set', 'put'],
    ])
      expect(spec.body.paths[path]?.[verb]).toBeDefined();
  });

  test('API-08: local and inherited status responses are complete and reset is safe on an empty owner', async () => {
    const alice = await login();
    const before = await as(alice).get(`/v1/containers/${ids.q2}/status-set`);
    expect(before.body.local).toBeNull();
    expect(before.body.inherited.statuses.map((item) => item.key)).toEqual([
      'todo',
      'in_progress',
      'done',
    ]);
    await as(alice).delete(`/v1/containers/${ids.q2}/status-set`).expect(204);
    const after = await as(alice).get(`/v1/containers/${ids.q2}/status-set`);
    expect(after.body).toEqual(before.body);
  });

  test('API-10: malformed and foreign IDs cannot create grants or fields', async () => {
    const alice = await login();
    const before = await db.containerGrant.count();
    error(
      await as(alice)
        .put(`/v1/containers/${ids.security}/grants/${id(99999)}`)
        .send({ mode: 'allow' }),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await as(alice).put(`/v1/containers/${ids.security}/grants/not-uuid`).send({ mode: 'allow' }),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await as(alice)
        .post(`/v1/containers/${ids.backlog}/fields`)
        .send({ key: 'invalid', type: 'text', required: false, options: [] }),
      400,
      'VALIDATION_ERROR',
    );
    expect(await db.containerGrant.count()).toBe(before);
  });

  test('RUN-02: idempotent seed leaves a changed task and existing accounts intact', async () => {
    await db.task.update({
      where: { id: ids.firstBacklogTask },
      data: { title: 'Local edit survives seed' },
    });
    execFileSync('node_modules/.bin/tsx', ['apps/api/prisma/seed.ts'], {
      cwd: process.cwd(),
      env: process.env,
      timeout: 30000,
    });
    expect((await db.task.findUnique({ where: { id: ids.firstBacklogTask } })).title).toBe(
      'Local edit survives seed',
    );
    expect(await db.task.count()).toBe(24);
    expect(await db.user.count()).toBe(3);
  });
});

describe('configuration scope and task ordering', () => {
  test('FLOW-09: separate board pages can straddle a configuration edit and require a refetch', async () => {
    const alice = await login();
    const first = await as(alice).get(`/v1/lists/${ids.backlog}/board?offset=0&limit=2`);
    const original = first.body.statuses.find((row) => row.key === 'todo').name;
    const local = (await as(alice).get(`/v1/containers/${ids.engineering}/status-set`)).body.local
      .statuses;
    await as(alice)
      .put(`/v1/containers/${ids.engineering}/status-set`)
      .send({
        statuses: local.map((row) => ({
          key: row.key,
          name: row.key === 'todo' ? 'Ready' : row.name,
          category: row.category,
          color: row.color,
        })),
      })
      .expect(200);
    const second = await as(alice).get(`/v1/lists/${ids.backlog}/board?offset=2&limit=2`);
    expect(original).toBe('Todo');
    expect(second.body.statuses.find((row) => row.key === 'todo').name).toBe('Ready');
    expect(
      (await as(alice).get(`/v1/lists/${ids.backlog}/board?offset=0&limit=2`)).body.statuses.find(
        (row) => row.key === 'todo',
      ).name,
    ).toBe('Ready');
  });

  test('TASK-09: board pagination follows resolved column order and stable task position', async () => {
    const alice = await login();
    const board = (await as(alice).get(`/v1/lists/${ids.backlog}/board?offset=0&limit=6`))
      .body as BoardResponse;
    const statusOrder = new Map(board.statuses.map((row, index) => [row.key, index]));
    const sorted = [...board.items].sort(
      (a, b) =>
        statusOrder.get(a.statusKey) - statusOrder.get(b.statusKey) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
    expect(board.items.map((row) => row.id)).toEqual(sorted.map((row) => row.id));
    const page = (await as(alice).get(`/v1/lists/${ids.backlog}/board?offset=2&limit=2`)).body;
    expect(page.items.map((row) => row.id)).toEqual(board.items.slice(2, 4).map((row) => row.id));
  });

  test('HIER-06 FLOW-05 STATUS-11: ancestor status edit checks retained archived descendants, while lower override remains independent', async () => {
    const alice = await login();
    const backlogTask = (await as(alice).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    await as(alice)
      .delete(`/v1/tasks/${backlogTask.id}?expectedVersion=${backlogTask.version}`)
      .expect(204);
    const before = (await as(alice).get(`/v1/containers/${ids.engineering}/status-set`)).body.local
      .statuses;
    const candidate = before
      .filter((row) => row.key !== 'todo')
      .map((row) => ({ key: row.key, name: row.name, category: row.category, color: row.color }));
    candidate.unshift({ key: 'ready', name: 'Ready', category: 'not_started', color: '#111111' });
    error(
      await as(alice)
        .put(`/v1/containers/${ids.engineering}/status-set`)
        .send({ statuses: candidate }),
      409,
      'CONFLICT',
    );
    expect(
      (await as(alice).get(`/v1/containers/${ids.engineering}/status-set`)).body.local.statuses.map(
        (row) => row.key,
      ),
    ).toEqual(before.map((row) => row.key));
    expect(
      (await as(alice).get(`/v1/lists/${ids.delivery}/board`)).body.statuses.map((row) => row.key),
    ).toContain('building');
  });

  test('STATUS-05 TASK-07: invalid status and foreign placement anchor preserve task version', async () => {
    const alice = await login();
    const before = (await as(alice).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    error(
      await as(alice)
        .patch(`/v1/tasks/${before.id}`)
        .send({ expectedVersion: before.version, statusKey: 'building' }),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await as(alice).post(`/v1/tasks/${before.id}/placement`).send({
        expectedVersion: before.version,
        statusKey: 'todo',
        beforeTaskId: ids.firstDeliveryTask,
      }),
      400,
      'VALIDATION_ERROR',
    );
    expect((await as(alice).get(`/v1/tasks/${before.id}`)).body).toEqual(before);
  });

  test('TASK-06: status change and placement alter the column while keeping list and dense positions', async () => {
    const alice = await login();
    const before = (await as(alice).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    const placed = await as(alice)
      .post(`/v1/tasks/${before.id}/placement`)
      .send({ expectedVersion: before.version, statusKey: 'done' });
    expect(placed.status).toBe(200);
    expect(placed.body.primaryListId).toBe(ids.backlog);
    expect(placed.body.statusKey).toBe('done');
    const board = (await as(alice).get(`/v1/lists/${ids.backlog}/board`)).body;
    expect(board.items.find((row) => row.id === before.id).statusKey).toBe('done');
    const positions = board.items
      .filter((row) => row.statusKey === 'done')
      .map((row) => row.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
  });

  test('TASK-10: changing identity-provider mapping does not rewrite task creator or assignee IDs', async () => {
    const task = await db.task.findUnique({
      where: { id: ids.firstBacklogTask },
      include: { assignees: true },
    });
    await db.authIdentity.update({
      where: { id: id(100) },
      data: { subject: 'new-external-subject' },
    });
    const after = await db.task.findUnique({
      where: { id: task.id },
      include: { assignees: true },
    });
    expect(after.id).toBe(task.id);
    expect(after.createdByUserId).toBe(task.createdByUserId);
    expect(after.assignees.map((row) => row.userId)).toEqual(
      task.assignees.map((row) => row.userId),
    );
  });

  test('TASK-11 API-09: overview counts only visible lists and orders at most five future due summaries', async () => {
    const alice = await login();
    const bob = await login('bob');
    const a = (await as(alice).get(`/v1/workspaces/${ids.workspace}/overview`)).body;
    const b = (await as(bob).get(`/v1/workspaces/${ids.workspace}/overview`)).body;
    expect(a.totals.visibleTasks).toBe(24);
    expect(b.totals.visibleTasks).toBe(18);
    expect(a.upcoming.length).toBeLessThanOrEqual(5);
    expect(a.upcoming.map((row) => row.dueDate)).toEqual(
      [...a.upcoming.map((row) => row.dueDate)].sort(),
    );
    expect(JSON.stringify(b)).not.toContain(ids.roadmap);
  });

  test('RUN-08 FLOW-01: each board response contains tasks valid for its own status snapshot', async () => {
    const alice = await login();
    const first = as(alice).get(`/v1/lists/${ids.backlog}/board`);
    const second = as(alice).get(`/v1/lists/${ids.backlog}/board`);
    for (const response of await Promise.all([first, second])) {
      expect(response.status).toBe(200);
      const keys = new Set(response.body.statuses.map((row) => row.key));
      response.body.items.forEach((task) => expect(keys.has(task.statusKey)).toBe(true));
    }
  });
});
