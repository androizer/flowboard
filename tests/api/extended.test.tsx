import { api, db, id, ids, origin, reset, login, as, error } from './support';
import jwt, { type SignOptions } from 'jsonwebtoken';

beforeEach(reset);
afterAll(() => db.$disconnect());

describe('identity and database invariants', () => {
  test('AUTH-06: signature, algorithm, issuer, audience, expiry, sid, and subject are validated', async () => {
    await login();
    const session = await db.authSession.findFirst({ where: { userId: ids.alice } });
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required for token validation tests.');
    const base: SignOptions = {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      subject: ids.alice,
      expiresIn: '1m',
    };
    const cases = [
      jwt.sign({ sid: session.id }, 'wrong-test-signing-secret-32-bytes-minimum', base),
      jwt.sign({ sid: session.id }, secret, { ...base, algorithm: 'HS384' }),
      jwt.sign({ sid: session.id }, secret, { ...base, issuer: 'wrong-issuer' }),
      jwt.sign({ sid: session.id }, secret, { ...base, audience: 'wrong-audience' }),
      jwt.sign({ sid: session.id }, secret, { ...base, expiresIn: -1 }),
      jwt.sign({ sid: id(99999) }, secret, base),
      jwt.sign({ sid: session.id }, secret, { ...base, subject: ids.bob }),
    ];
    for (const token of cases)
      error(
        await api.get('/v1/me').set('Authorization', `Bearer ${token}`),
        401,
        'UNAUTHENTICATED',
      );
  });

  test('AUTH-15: migrated database keeps user-owned credentials and session-family revocation', async () => {
    const rows = await db.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('user_credentials', 'auth_sessions', 'refresh_tokens')",
    );
    const columns = (name) =>
      new Set(rows.filter((row) => row.table_name === name).map((row) => row.column_name));
    expect(columns('user_credentials')).toContain('user_id');
    expect(columns('user_credentials')).not.toContain('auth_identity_id');
    expect(columns('auth_sessions')).toContain('revoked_at');
    expect(columns('auth_sessions')).toContain('user_id');
    expect(columns('refresh_tokens')).not.toContain('revoked_at');
  });

  test('AUTH-03: a missing local identity stops sign-in before session creation', async () => {
    await db.authIdentity.delete({ where: { id: id(100) } });
    error(
      await api
        .post('/v1/auth/login')
        .send({ loginIdentifier: 'alice@flowboard.com', password: 'FlowboardDemo!2026' }),
      403,
      'FORBIDDEN',
    );
    expect(await db.authSession.count()).toBe(0);
  });

  test('AUTH-05 RUN-04: database rejects a session tied to another user identity', async () => {
    await expect(
      db.authSession.create({
        data: { userId: ids.bob, authIdentityId: id(100), expiresAt: new Date(Date.now() + 60000) },
      }),
    ).rejects.toThrow();
    expect(await db.authSession.count()).toBe(0);
  });

  test('AUTH-07 PERM-08: inactive membership blocks an already-issued admin token', async () => {
    const alice = await login();
    await db.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId: ids.workspace, userId: ids.alice } },
      data: { isActive: false },
    });
    error(await as(alice).get('/v1/tree'), 403, 'FORBIDDEN');
    error(
      await api
        .post('/v1/auth/login')
        .send({ loginIdentifier: 'alice@flowboard.com', password: 'FlowboardDemo!2026' }),
      403,
      'FORBIDDEN',
    );
  });

  test('AUTH-13: refresh cookie is HttpOnly, host scoped, and restricted to auth path', async () => {
    const alice = await login();
    const cookie = (
      await api.post('/v1/auth/refresh').set('Origin', origin).set('Cookie', alice.cookie)
    ).headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/v1\/auth/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  test('RUN-04 HIER-02 TASK-03: strict parent and task-list constraints reject direct invalid writes', async () => {
    await expect(
      db.container.create({
        data: {
          workspaceId: ids.workspace,
          type: 'list',
          parentType: 'space',
          parentContainerId: ids.engineering,
          name: 'Invalid list',
          position: 9,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.task.create({
        data: {
          workspaceId: ids.workspace,
          primaryListId: ids.q2,
          primaryListType: 'folder',
          createdByUserId: ids.alice,
          title: 'Wrong holder',
          statusKey: 'todo',
          position: 1,
        },
      }),
    ).rejects.toThrow();
    expect(await db.task.count()).toBe(24);
  });
});

describe('path permissions and hierarchy mutations', () => {
  test('HIER-07: an empty created list returns a valid empty board and no invented child tasks', async () => {
    const alice = await login();
    const list = await as(alice)
      .post('/v1/containers')
      .send({ parentId: ids.q2, type: 'list', name: 'Empty test list' });
    expect(list.status).toBe(201);
    const board = await as(alice).get(`/v1/lists/${list.body.id}/board`);
    expect(board.status).toBe(200);
    expect(board.body.items).toEqual([]);
    expect(board.body.page.total).toBe(0);
  });

  test('HIER-13: an allowed member cannot claim creator rights on a legacy container', async () => {
    const alice = await login();
    const bob = await login('bob');
    expect(
      (await db.container.findUnique({ where: { id: ids.security } })).createdByUserId,
    ).toBeNull();
    expect((await as(bob).get(`/v1/lists/${ids.security}/board`)).status).toBe(200);
    error(await as(bob).get(`/v1/containers/${ids.security}/grants`), 403, 'FORBIDDEN');
    expect((await as(alice).get(`/v1/containers/${ids.security}/grants`)).status).toBe(200);
  });

  test('PERM-04 PERM-05: a child allow does not bypass a denied or private parent', async () => {
    const alice = await login();
    const bob = await login('bob');
    await as(alice)
      .put(`/v1/containers/${ids.q2}/grants/${ids.bob}`)
      .send({ mode: 'deny' })
      .expect(200);
    error(await as(bob).get(`/v1/lists/${ids.security}/board`), 403, 'FORBIDDEN');
    expect(JSON.stringify((await as(bob).get('/v1/tree')).body)).not.toContain(ids.security);
    await as(alice)
      .put(`/v1/containers/${ids.roadmap}/grants/${ids.bob}`)
      .send({ mode: 'allow' })
      .expect(200);
    error(await as(bob).get(`/v1/lists/${ids.roadmap}/board`), 403, 'FORBIDDEN');
  });

  test('HIER-03 HIER-04: rename and reorder preserve child IDs and persisted sibling order', async () => {
    const alice = await login();
    await as(alice).patch(`/v1/containers/${ids.q2}`).send({ name: 'Renamed folder' }).expect(200);
    expect((await db.container.findUnique({ where: { id: ids.backlog } })).parentContainerId).toBe(
      ids.q2,
    );
    await as(alice)
      .post('/v1/containers/reorder')
      .send({ parentId: ids.q2, ids: [ids.delivery, ids.security, ids.backlog] })
      .expect(200);
    expect(
      (
        await db.container.findMany({
          where: { parentContainerId: ids.q2 },
          orderBy: { position: 'asc' },
        })
      ).map((item) => item.id),
    ).toEqual([ids.delivery, ids.security, ids.backlog]);
  });

  test('HIER-05 HIER-09: archiving a folder hides descendants while retaining rows and values', async () => {
    const alice = await login();
    const count = await db.task.count({ where: { primaryListId: ids.backlog } });
    await as(alice).delete(`/v1/containers/${ids.q2}`).expect(204);
    error(await as(alice).get(`/v1/lists/${ids.backlog}/board`), 404, 'NOT_FOUND');
    expect(await db.task.count({ where: { primaryListId: ids.backlog } })).toBe(count);
    expect(JSON.stringify((await as(alice).get('/v1/tree')).body)).not.toContain(ids.backlog);
  });

  test('PERM-12 PERM-14 PERM-16 API-12: creator share checks recipient path and protects own grant', async () => {
    const bob = await login('bob');
    const carol = await login('carol');
    const privateList = await as(bob)
      .post('/v1/containers')
      .send({ parentId: ids.q2, type: 'list', name: 'Bob private list', visibility: 'private' });
    expect(privateList.status).toBe(201);
    await as(bob)
      .put(`/v1/containers/${privateList.body.id}/grants/${ids.carol}`)
      .send({ mode: 'allow' })
      .expect(200);
    expect(JSON.stringify((await as(carol).get('/v1/tree')).body)).toContain(privateList.body.id);
    error(
      await as(bob).delete(`/v1/containers/${privateList.body.id}/grants/${ids.bob}`),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await as(carol)
        .put(`/v1/containers/${privateList.body.id}/grants/${ids.alice}`)
        .send({ mode: 'allow' }),
      403,
      'FORBIDDEN',
    );
    const bobProductList = await as(bob)
      .post('/v1/containers')
      .send({ parentId: ids.strategy, type: 'list', name: 'Blocked' });
    error(bobProductList, 403, 'FORBIDDEN');
    expect(await db.container.count({ where: { name: 'Blocked' } })).toBe(0);
  });

  test('PERM-11 FLOW-12: revoked admin role cannot mutate after token issuance', async () => {
    const alice = await login();
    await db.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId: ids.workspace, userId: ids.alice } },
      data: { role: 'member' },
    });
    error(
      await as(alice).patch(`/v1/containers/${ids.q2}`).send({ name: 'Unauthorized' }),
      403,
      'FORBIDDEN',
    );
    expect((await db.container.findUnique({ where: { id: ids.q2 } })).name).toBe('Q2 Launch');
  });

  test('PERM-15: a public child under a private space stays hidden until the parent is shared', async () => {
    const alice = await login();
    const bob = await login('bob');
    const child = await as(alice).post('/v1/containers').send({
      parentId: ids.product,
      type: 'folder',
      name: 'Public under private',
      visibility: 'public',
    });
    expect(child.status).toBe(201);
    expect(JSON.stringify((await as(bob).get('/v1/tree')).body)).not.toContain(child.body.id);
    await as(alice)
      .put(`/v1/containers/${child.body.id}/grants/${ids.bob}`)
      .send({ mode: 'allow' })
      .expect(200);
    expect(JSON.stringify((await as(bob).get('/v1/tree')).body)).not.toContain(child.body.id);
    await as(alice)
      .put(`/v1/containers/${ids.product}/grants/${ids.bob}`)
      .send({ mode: 'allow' })
      .expect(200);
    expect(JSON.stringify((await as(bob).get('/v1/tree')).body)).toContain(child.body.id);
  });

  test('FLOW-14: an ineligible share target leaves creator grants unchanged', async () => {
    const bob = await login('bob');
    const list = await as(bob)
      .post('/v1/containers')
      .send({ parentId: ids.q2, type: 'list', name: 'Owned for sharing', visibility: 'private' });
    expect(list.status).toBe(201);
    await db.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId: ids.workspace, userId: ids.carol } },
      data: { isActive: false },
    });
    const before = await db.containerGrant.findMany({ where: { containerId: list.body.id } });
    error(
      await as(bob)
        .put(`/v1/containers/${list.body.id}/grants/${ids.carol}`)
        .send({ mode: 'allow' }),
      400,
      'VALIDATION_ERROR',
    );
    expect(await db.containerGrant.findMany({ where: { containerId: list.body.id } })).toEqual(
      before,
    );
  });
});

describe('configuration changes and retained data', () => {
  test('STATUS-01: a new list with no local set uses the workspace fallback', async () => {
    const alice = await login();
    const space = await as(alice)
      .post('/v1/containers')
      .send({ parentId: null, type: 'space', name: 'Fallback space' });
    const folder = await as(alice)
      .post('/v1/containers')
      .send({ parentId: space.body.id, type: 'folder', name: 'Fallback folder' });
    const list = await as(alice)
      .post('/v1/containers')
      .send({ parentId: folder.body.id, type: 'list', name: 'Fallback list' });
    const board = await as(alice).get(`/v1/lists/${list.body.id}/board`);
    expect(board.status).toBe(200);
    expect(board.body.statusSource.type).toBe('workspace');
    expect(board.body.statuses.map((row) => row.key)).toEqual(['todo', 'in_progress', 'done']);
    expect(board.body.fields).toHaveLength(0);
  });

  test('STATUS-07 STATUS-10: incompatible reset cannot discard local set even for archived task', async () => {
    const alice = await login();
    const task = (await as(alice).get(`/v1/tasks/${ids.firstDeliveryTask}`)).body;
    await as(alice).delete(`/v1/tasks/${task.id}?expectedVersion=${task.version}`).expect(204);
    error(await as(alice).delete(`/v1/containers/${ids.delivery}/status-set`), 409, 'CONFLICT');
    expect(
      (await as(alice).get(`/v1/containers/${ids.delivery}/status-set`)).body.local.statuses.map(
        (row) => row.key,
      ),
    ).toContain('building');
  });

  test('STATUS-08 STATUS-09: ancestor rename and reorder affect inheritors, not lower override tasks', async () => {
    const alice = await login();
    const before = (await as(alice).get(`/v1/containers/${ids.engineering}/status-set`)).body.local;
    const changed = before.statuses
      .map((row) => ({
        key: row.key,
        name: row.key === 'todo' ? 'Ready' : row.name,
        category: row.category,
        color: row.color,
      }))
      .reverse();
    await as(alice)
      .put(`/v1/containers/${ids.engineering}/status-set`)
      .send({ statuses: changed })
      .expect(200);
    const backlog = (await as(alice).get(`/v1/lists/${ids.backlog}/board`)).body;
    const delivery = (await as(alice).get(`/v1/lists/${ids.delivery}/board`)).body;
    expect(backlog.statuses.map((row) => row.key)).toEqual(changed.map((row) => row.key));
    expect(backlog.statuses.find((row) => row.key === 'todo').name).toBe('Ready');
    expect(delivery.statuses.find((row) => row.key === 'todo').name).toBe('Todo');
    expect((await db.task.findUnique({ where: { id: ids.firstBacklogTask } })).statusKey).toBe(
      'todo',
    );
  });

  test('FIELD-07 FIELD-11 FIELD-12: archived answers block destructive field and option edits', async () => {
    const alice = await login();
    const task = (await as(alice).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    await as(alice).delete(`/v1/tasks/${task.id}?expectedVersion=${task.version}`).expect(204);
    error(await as(alice).delete(`/v1/fields/${ids.customerNote}`), 409, 'CONFLICT');
    const before = await db.customFieldDefinition.findUnique({
      where: { id: ids.workType },
      include: { options: true },
    });
    error(
      await as(alice)
        .patch(`/v1/fields/${ids.workType}`)
        .send({
          options: before.options
            .filter((item) => item.id !== id(301))
            .map((item) => ({ id: item.id, label: item.label, color: item.color })),
        }),
      409,
      'CONFLICT',
    );
    expect(await db.customFieldOption.count({ where: { fieldDefinitionId: ids.workType } })).toBe(
      2,
    );
  });

  test('FIELD-14: reordering local fields leaves inherited owner and order intact', async () => {
    const alice = await login();
    const added = await as(alice)
      .post(`/v1/containers/${ids.backlog}/fields`)
      .send({ key: 'test_note', name: 'Test note', type: 'text', required: false, options: [] });
    expect(added.status).toBe(201);
    await as(alice)
      .post(`/v1/containers/${ids.backlog}/fields/reorder`)
      .send({ ids: [added.body.id, ids.customerNote] })
      .expect(200);
    const board = (await as(alice).get(`/v1/lists/${ids.backlog}/board`)).body;
    expect(board.fields.findIndex((row) => row.key === 'test_note')).toBeLessThan(
      board.fields.findIndex((row) => row.key === 'customer_note'),
    );
    expect(
      (await db.customFieldDefinition.findUnique({ where: { id: ids.effort } })).ownerContainerId,
    ).toBe(ids.engineering);
  });
});
