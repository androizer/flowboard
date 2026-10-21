import { api, db, id, ids, origin, reset, login, as, error } from './support';

beforeEach(reset);
afterAll(() => db.$disconnect());

describe('identity and sessions', () => {
  test('AUTH-01 AUTH-15: login stores one user-owned session and only a refresh hash', async () => {
    const alice = await login();
    expect((await as(alice).get('/v1/me')).body).toEqual(
      expect.objectContaining({ userId: ids.alice }),
    );
    const sessions = await db.authSession.findMany({
      where: { userId: ids.alice },
      include: { refreshTokens: true },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].authIdentityId).toBe(id(100));
    expect(sessions[0].refreshTokens).toHaveLength(1);
    expect(sessions[0].refreshTokens[0].tokenHash).not.toContain(alice.cookie.split('=')[1]);
    const credential = await db.userCredential.findUnique({ where: { userId: ids.alice } });
    expect(credential.userId).toBe(ids.alice);
  });

  test.each(['unknown@flowboard.com', 'alice@flowboard.com'])(
    'AUTH-02: invalid local credentials return generic 401 (%s)',
    async (loginIdentifier) => {
      const result = await api
        .post('/v1/auth/login')
        .send({ loginIdentifier, password: 'incorrect' });
      error(result, 401, 'UNAUTHENTICATED');
      expect(await db.authSession.count()).toBe(0);
    },
  );

  test('AUTH-06 API-07: unsigned, malformed, and absent access tokens cannot reach domain data', async () => {
    error(await api.get('/v1/tree'), 401, 'UNAUTHENTICATED');
    error(
      await api.get('/v1/tree').set('Authorization', 'Bearer invalid.jwt.token'),
      401,
      'UNAUTHENTICATED',
    );
    const health = await api.get('/health');
    expect(health.status).toBe(200);
    expect(JSON.stringify(health.body)).not.toContain('flowboard_test');
  });

  test('AUTH-08 AUTH-09 RUN-06: refresh rotation consumes the parent and replay commits family revocation', async () => {
    const alice = await login();
    const rotated = await api
      .post('/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', alice.cookie);
    expect(rotated.status).toBe(201);
    const successor = rotated.headers['set-cookie'][0].split(';')[0];
    const tokens = await db.refreshToken.findMany({ include: { session: true } });
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((item) => item.consumedAt)).toHaveLength(1);
    expect(tokens[0].sessionId).toBe(tokens[1].sessionId);
    expect(tokens[0].expiresAt.getTime()).toBe(tokens[1].expiresAt.getTime());
    error(
      await api.post('/v1/auth/refresh').set('Origin', origin).set('Cookie', alice.cookie),
      401,
      'UNAUTHENTICATED',
    );
    expect((await db.authSession.findFirst()).revokedAt).not.toBeNull();
    error(
      await api.post('/v1/auth/refresh').set('Origin', origin).set('Cookie', successor),
      401,
      'UNAUTHENTICATED',
    );
    error(await as(alice).get('/v1/me'), 401, 'UNAUTHENTICATED');
  });

  test('AUTH-10: concurrent refresh of one token cannot create two usable branches', async () => {
    const alice = await login();
    const [first, second] = await Promise.all([
      api.post('/v1/auth/refresh').set('Origin', origin).set('Cookie', alice.cookie),
      api.post('/v1/auth/refresh').set('Origin', origin).set('Cookie', alice.cookie),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 401]);
    const session = await db.authSession.findFirst();
    expect(session.revokedAt).not.toBeNull();
    expect(await db.refreshToken.count({ where: { parentTokenId: { not: null } } })).toBe(1);
  });

  test('AUTH-11: logout revokes only the current session; logout-all revokes every session', async () => {
    const one = await login();
    const two = await login();
    expect((await as(one).post('/v1/auth/logout').set('Origin', origin)).status).toBe(204);
    error(await as(one).get('/v1/me'), 401, 'UNAUTHENTICATED');
    expect((await as(two).get('/v1/me')).status).toBe(200);
    expect((await as(two).post('/v1/auth/logout-all').set('Origin', origin)).status).toBe(204);
    error(await as(two).get('/v1/me'), 401, 'UNAUTHENTICATED');
  });

  test('AUTH-13: refresh and logout reject an untrusted Origin without changing session state', async () => {
    const alice = await login();
    error(
      await api
        .post('/v1/auth/refresh')
        .set('Origin', 'https://untrusted.example')
        .set('Cookie', alice.cookie),
      403,
      'FORBIDDEN',
    );
    error(
      await as(alice).post('/v1/auth/logout').set('Origin', 'https://untrusted.example'),
      403,
      'FORBIDDEN',
    );
    expect((await as(alice).get('/v1/me')).status).toBe(200);
  });
});

describe('hierarchy, permissions, and overview', () => {
  test('PERM-01 PERM-02 PERM-03 FLOW-10: tree and overview omit private branches and counts', async () => {
    const cases: Array<[string, string[], string[]]> = [
      ['alice', [ids.security, ids.roadmap, ids.delivery], []],
      ['bob', [ids.security, ids.delivery], [ids.product, ids.roadmap]],
      ['carol', [ids.roadmap, ids.backlog], [ids.delivery, ids.security]],
    ];
    for (const [name, expected, hidden] of cases) {
      const actor = await login(name);
      const tree = await as(actor).get('/v1/tree');
      expect(tree.status).toBe(200);
      const serialized = JSON.stringify(tree.body);
      expected.forEach((value) => expect(serialized).toContain(value));
      hidden.forEach((value) => expect(serialized).not.toContain(value));
      const overview = await as(actor).get(`/v1/workspaces/${ids.workspace}/overview`);
      expect(overview.status).toBe(200);
      const visible = JSON.stringify(overview.body);
      hidden.forEach((value) => expect(visible).not.toContain(value));
    }
  });

  test('PERM-06 PERM-07 API-09: guessed private list/task URLs and foreign workspace are unavailable', async () => {
    const bob = await login('bob');
    error(await as(bob).get(`/v1/lists/${ids.roadmap}/board`), 403, 'FORBIDDEN');
    error(await as(bob).get(`/v1/tasks/${ids.firstRoadmapTask}`), 403, 'FORBIDDEN');
    error(await as(bob).get(`/v1/workspaces/${id(9999)}/overview`), 404, 'NOT_FOUND');
  });

  test('HIER-01 HIER-08 HIER-12: member creates a private valid path and retains creator access', async () => {
    const bob = await login('bob');
    const space = await as(bob)
      .post('/v1/containers')
      .send({ parentId: null, type: 'space', name: 'Bob Space', visibility: 'private' });
    expect(space.status).toBe(201);
    expect(space.body).toEqual(
      expect.objectContaining({
        workspaceId: ids.workspace,
        createdByUserId: ids.bob,
        type: 'space',
      }),
    );
    expect(
      await db.containerGrant.count({
        where: { containerId: space.body.id, userId: ids.bob, mode: 'allow' },
      }),
    ).toBe(1);
    const folder = await as(bob)
      .post('/v1/containers')
      .send({ parentId: space.body.id, type: 'folder', name: 'Bob Folder' });
    expect(folder.status).toBe(201);
    const list = await as(bob)
      .post('/v1/containers')
      .send({ parentId: folder.body.id, type: 'list', name: 'Bob List' });
    expect(list.status).toBe(201);
    expect((await as(bob).get(`/v1/lists/${list.body.id}/board`)).status).toBe(200);
    error(
      await as(bob).patch(`/v1/containers/${list.body.id}`).send({ name: 'Forbidden edit' }),
      403,
      'FORBIDDEN',
    );
  });

  test('HIER-02 HIER-10: invalid parent and incomplete reorder leave hierarchy unchanged', async () => {
    const alice = await login();
    error(
      await as(alice)
        .post('/v1/containers')
        .send({ parentId: ids.engineering, type: 'list', name: 'Bad' }),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await as(alice)
        .post('/v1/containers/reorder')
        .send({ parentId: ids.q2, ids: [ids.backlog] }),
      400,
      'VALIDATION_ERROR',
    );
    const nodes = await db.container.findMany({
      where: { parentContainerId: ids.q2 },
      orderBy: { position: 'asc' },
    });
    expect(nodes.map((node) => node.id)).toEqual([ids.backlog, ids.delivery, ids.security]);
  });

  test('PERM-09 FLOW-12: forged member role cannot change configuration or grants', async () => {
    const bob = await login('bob');
    error(
      await as(bob)
        .put(`/v1/containers/${ids.delivery}/status-set`)
        .send({ role: 'admin', statuses: [] }),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await as(bob).patch(`/v1/containers/${ids.delivery}`).send({ name: 'Hijack' }),
      403,
      'FORBIDDEN',
    );
    error(
      await as(bob)
        .put(`/v1/containers/${ids.delivery}/grants/${ids.carol}`)
        .send({ mode: 'allow' }),
      403,
      'FORBIDDEN',
    );
    expect((await db.container.findUnique({ where: { id: ids.delivery } })).name).toBe('Delivery');
  });

  test('PERM-12 PERM-13: admin grant is rejected; replacing allow with deny keeps one row', async () => {
    const alice = await login();
    error(
      await as(alice)
        .put(`/v1/containers/${ids.security}/grants/${ids.alice}`)
        .send({ mode: 'allow' }),
      400,
      'VALIDATION_ERROR',
    );
    expect(
      (
        await as(alice)
          .put(`/v1/containers/${ids.security}/grants/${ids.carol}`)
          .send({ mode: 'allow' })
      ).status,
    ).toBe(200);
    expect(
      (
        await as(alice)
          .put(`/v1/containers/${ids.security}/grants/${ids.carol}`)
          .send({ mode: 'deny' })
      ).status,
    ).toBe(200);
    const rules = await db.containerGrant.findMany({
      where: { containerId: ids.security, userId: ids.carol },
    });
    expect(rules).toHaveLength(1);
    expect(rules[0].mode).toBe('deny');
  });
});

describe('status and custom-field resolution', () => {
  test('STATUS-02 STATUS-03 FIELD-01: sibling lists resolve distinct complete status sets and additive fields', async () => {
    const alice = await login();
    const backlog = (await as(alice).get(`/v1/lists/${ids.backlog}/board`)).body;
    const delivery = (await as(alice).get(`/v1/lists/${ids.delivery}/board`)).body;
    expect(backlog.statuses.map((row) => row.key)).toEqual(['todo', 'in_progress', 'done']);
    expect(delivery.statuses.map((row) => row.key)).toEqual(['todo', 'building', 'review', 'done']);
    expect(backlog.fields.map((row) => row.key)).toEqual(
      expect.arrayContaining(['effort', 'work_type', 'tags', 'target_date', 'customer_note']),
    );
    expect(delivery.fields.map((row) => row.key)).toEqual(
      expect.arrayContaining(['effort', 'work_type', 'tags', 'target_date', 'verified']),
    );
    expect(delivery.fields.map((row) => row.key)).not.toContain('customer_note');
  });

  test('STATUS-04 STATUS-06 API-11: malformed and destructive status candidates preserve the old set', async () => {
    const alice = await login();
    const before = (await as(alice).get(`/v1/containers/${ids.delivery}/status-set`)).body.local;
    const statuses = before.statuses.map((row) => ({
      key: row.key,
      name: row.name,
      category: row.category,
      color: row.color,
    }));
    error(
      await as(alice)
        .put(`/v1/containers/${ids.delivery}/status-set`)
        .send({ statuses: statuses.filter((row) => row.category !== 'done') }),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await as(alice)
        .put(`/v1/containers/${ids.delivery}/status-set`)
        .send({ statuses: statuses.filter((row) => row.key !== 'building') }),
      409,
      'CONFLICT',
    );
    expect(
      (await as(alice).get(`/v1/containers/${ids.delivery}/status-set`)).body.local.statuses.map(
        (row) => row.key,
      ),
    ).toEqual(before.statuses.map((row) => row.key));
  });

  test('FIELD-02 FIELD-09 FIELD-13: duplicate key and required field cannot partially change stored schema', async () => {
    const alice = await login();
    const duplicate = {
      key: 'effort',
      name: 'Other effort',
      type: 'number',
      required: false,
      options: [],
    };
    error(
      await as(alice).post(`/v1/containers/${ids.backlog}/fields`).send(duplicate),
      409,
      'CONFLICT',
    );
    const required = {
      key: 'new_required',
      name: 'Required',
      type: 'text',
      required: true,
      options: [],
    };
    error(
      await as(alice).post(`/v1/containers/${ids.backlog}/fields`).send(required),
      409,
      'CONFLICT',
    );
    expect(
      await db.customFieldDefinition.count({ where: { key: { in: ['new_required', 'effort'] } } }),
    ).toBe(1);
  });

  test('FIELD-03 FIELD-04 FIELD-05 TASK-01: valid zero/false answers persist; bad types and missing required answers fail', async () => {
    const alice = await login();
    const base = {
      title: 'Zero effort',
      statusKey: 'todo',
      customFields: { effort: 0, work_type: id(302) },
    };
    const created = await as(alice)
      .post(`/v1/lists/${ids.delivery}/tasks`)
      .send({ ...base, customFields: { ...base.customFields, verified: false } });
    expect(created.status).toBe(201);
    expect(created.body.customFields).toEqual(
      expect.objectContaining({ effort: 0, verified: false }),
    );
    error(
      await as(alice)
        .post(`/v1/lists/${ids.delivery}/tasks`)
        .send({ ...base, customFields: { work_type: id(302) } }),
      400,
      'VALIDATION_ERROR',
    );
    const invalid = await as(alice)
      .post(`/v1/lists/${ids.delivery}/tasks`)
      .send({ ...base, customFields: { effort: 'zero', work_type: id(302) } });
    error(invalid, 400, 'VALIDATION_ERROR');
    expect(invalid.body.error.details[0].path).toBe('customFields.effort');
  });

  test('FIELD-06 TASK-04: omitted answer is preserved and explicit null clears an optional answer', async () => {
    const alice = await login();
    const created = await as(alice)
      .post(`/v1/lists/${ids.backlog}/tasks`)
      .send({
        title: 'Answer patch',
        statusKey: 'todo',
        customFields: { effort: 1, work_type: id(302), customer_note: 'retain me' },
      });
    expect(created.status).toBe(201);
    const titleOnly = await as(alice)
      .patch(`/v1/tasks/${created.body.id}`)
      .send({ expectedVersion: created.body.version, title: 'Edited title' });
    expect(titleOnly.body.customFields.customer_note).toBe('retain me');
    const cleared = await as(alice)
      .patch(`/v1/tasks/${created.body.id}`)
      .send({ expectedVersion: titleOnly.body.version, customFields: { customer_note: null } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.customFields.customer_note).toBeUndefined();
  });

  test('FIELD-07 FIELD-08: retained answer blocks field deletion and type change', async () => {
    const alice = await login();
    error(await as(alice).delete(`/v1/fields/${ids.effort}`), 409, 'CONFLICT');
    error(
      await as(alice).patch(`/v1/fields/${ids.effort}`).send({ type: 'text' }),
      409,
      'CONFLICT',
    );
    expect((await db.customFieldDefinition.findUnique({ where: { id: ids.effort } })).type).toBe(
      'number',
    );
  });
});

describe('tasks, moves, and HTTP contract', () => {
  test('TASK-02 API-02: title, priority, and unknown fields fail without creating a task', async () => {
    const alice = await login();
    const count = await db.task.count();
    for (const input of [
      { title: ' ', statusKey: 'todo' },
      { title: 'x'.repeat(501), statusKey: 'todo' },
      { title: 'bad priority', statusKey: 'todo', priority: 'critical' },
      { title: 'forged', statusKey: 'todo', role: 'admin' },
    ])
      error(
        await as(alice).post(`/v1/lists/${ids.backlog}/tasks`).send(input),
        400,
        'VALIDATION_ERROR',
      );
    expect(await db.task.count()).toBe(count);
  });

  test('TASK-05 API-05 FLOW-07: stale version cannot overwrite task or answers', async () => {
    const alice = await login();
    const original = (await as(alice).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    error(
      await as(alice).patch(`/v1/tasks/${original.id}`).send({ title: 'Missing version' }),
      400,
      'VALIDATION_ERROR',
    );
    const changed = await as(alice)
      .patch(`/v1/tasks/${original.id}`)
      .send({ expectedVersion: original.version, title: 'First writer' });
    expect(changed.status).toBe(200);
    error(
      await as(alice)
        .patch(`/v1/tasks/${original.id}`)
        .send({
          expectedVersion: original.version,
          title: 'Stale writer',
          customFields: { effort: 999 },
        }),
      409,
      'CONFLICT',
    );
    const stored = (await as(alice).get(`/v1/tasks/${original.id}`)).body;
    expect(stored.title).toBe('First writer');
    expect(stored.customFields.effort).not.toBe(999);
  });

  test('FLOW-02 FIELD-10: incompatible move leaves source list, answers, and version untouched', async () => {
    const alice = await login();
    const original = (await as(alice).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    const rejected = await as(alice).post(`/v1/tasks/${original.id}/move`).send({
      expectedVersion: original.version,
      destinationListId: ids.delivery,
      statusKey: 'building',
    });
    error(rejected, 400, 'VALIDATION_ERROR');
    expect((await as(alice).get(`/v1/tasks/${original.id}`)).body).toEqual(original);
  });

  test('FLOW-03: corrected move preserves identity and shared values and clears source-only answers', async () => {
    const alice = await login();
    const original = (await as(alice).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    const move = await as(alice)
      .post(`/v1/tasks/${original.id}/move`)
      .send({
        expectedVersion: original.version,
        destinationListId: ids.delivery,
        statusKey: 'building',
        customFields: { customer_note: null },
      });
    expect(move.status).toBe(200);
    expect(move.body.id).toBe(original.id);
    expect(move.body.primaryListId).toBe(ids.delivery);
    expect(move.body.customFields.customer_note).toBeUndefined();
    expect(move.body.customFields.effort).toBe(original.customFields.effort);
    expect(move.body.assignees).toEqual(original.assignees);
    expect(move.body.version).toBe(original.version + 1);
  });

  test('FLOW-04 PERM-10: move into inaccessible list reveals no configuration and changes nothing', async () => {
    const bob = await login('bob');
    const task = (await as(bob).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    const response = await as(bob)
      .post(`/v1/tasks/${task.id}/move`)
      .send({ expectedVersion: task.version, destinationListId: ids.roadmap, statusKey: 'todo' });
    error(response, 403, 'FORBIDDEN');
    expect(JSON.stringify(response.body)).not.toContain('impact');
    expect((await db.task.findUnique({ where: { id: task.id } })).primaryListId).toBe(ids.backlog);
  });

  test('TASK-08: archived task is hidden but still blocks deletion of a used field', async () => {
    const alice = await login();
    const task = (await as(alice).get(`/v1/tasks/${ids.firstBacklogTask}`)).body;
    expect(
      (await as(alice).delete(`/v1/tasks/${task.id}?expectedVersion=${task.version}`)).status,
    ).toBe(204);
    error(await as(alice).get(`/v1/tasks/${task.id}`), 404, 'NOT_FOUND');
    error(await as(alice).delete(`/v1/fields/${ids.effort}`), 409, 'CONFLICT');
  });

  test('API-03 API-04: pagination has stable shape and invalid bounds share the error envelope', async () => {
    const alice = await login();
    const page = await as(alice).get(`/v1/lists/${ids.backlog}/tasks?offset=0&limit=2`);
    expect(page.status).toBe(200);
    expect(page.body.page).toEqual(
      expect.objectContaining({ offset: 0, limit: 2, total: 6, hasMore: true }),
    );
    expect(page.body.items).toHaveLength(2);
    error(await as(alice).get(`/v1/lists/${ids.backlog}/tasks?limit=101`), 400, 'VALIDATION_ERROR');
    error(await as(alice).get('/v1/containers/not-a-uuid'), 400, 'VALIDATION_ERROR');
  });
});
