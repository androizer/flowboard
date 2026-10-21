import { test, expect, type Page } from '@playwright/test';
import { db, ids, reset, login, as } from '../api/support';

test.beforeEach(async () => {
  await reset();
});
test.afterAll(async () => {
  await db.$disconnect();
});

async function signIn(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(`${name}@flowboard.com`);
  await page.getByLabel('Password').fill('FlowboardDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Flowboard home' })).toBeVisible();
}

test('WEB-01: edit a resolved custom answer and verify the stored value after reopening', async ({
  page,
}) => {
  await signIn(page, 'alice');
  await page.getByRole('button', { name: /Open Backlog/ }).click();
  await expect(page.locator('.kanban-column-heading')).toHaveCount(3);
  await page.locator('.task-card').filter({ hasText: 'Seed task 1' }).click();
  const dialog = page.getByRole('dialog', { name: 'Task details' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Customer note').fill('Browser persisted answer');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  const stored = await db.taskFieldValue.findFirst({
    where: { taskId: ids.firstBacklogTask, fieldDefinitionId: ids.customerNote },
  });
  expect(stored.value).toBe('Browser persisted answer');
  await page.locator('.task-card').filter({ hasText: 'Seed task 1' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Task details' }).getByLabel('Customer note'),
  ).toHaveValue('Browser persisted answer');
});

test('WEB-02 WEB-14 WEB-15: switching Alice to Bob removes private branch and identity state', async ({
  page,
}) => {
  await signIn(page, 'alice');
  await expect(page.getByText('Roadmap', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Account menu for Alice' }).click();
  await expect(page.getByText('alice@flowboard.com')).toBeVisible();
  await page.getByText('Sign Out', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await signIn(page, 'bob');
  await expect(page.getByText('Roadmap', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Account menu for Bob' }).click();
  await expect(page.getByText('bob@flowboard.com')).toBeVisible();
  await expect(page.getByText('alice@flowboard.com')).toHaveCount(0);
});

test('WEB-04: an in-flight Alice edit is not retried with Bob’s identity in another tab', async ({
  page,
  context,
}) => {
  await signIn(page, 'alice');
  const otherTab = await context.newPage();
  await otherTab.goto('/');
  await expect(otherTab.getByRole('heading', { name: 'Flowboard home' })).toBeVisible();
  await page.getByRole('button', { name: /Open Backlog/ }).click();
  await page.locator('.task-card').filter({ hasText: 'Seed task 1' }).click();
  const dialog = page.getByRole('dialog', { name: 'Task details' });
  await dialog.getByLabel('Title').fill('Alice pending edit');

  let releaseResponse!: () => void;
  let requestStarted!: () => void;
  const blockedResponse = new Promise<void>((resolve) => (releaseResponse = resolve));
  const firstRequest = new Promise<void>((resolve) => (requestStarted = resolve));
  let editRequests = 0;
  await page.route(`**/v1/tasks/${ids.firstBacklogTask}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    editRequests++;
    requestStarted();
    await blockedResponse;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }),
    });
  });
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await firstRequest;

  await otherTab.getByRole('button', { name: 'Account menu for Alice' }).click();
  await otherTab.getByText('Sign Out', { exact: true }).click();
  await expect(otherTab.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await signIn(otherTab, 'bob');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  const rejectedEdit = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/v1/tasks/${ids.firstBacklogTask}`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 401,
  );
  releaseResponse();
  await rejectedEdit;
  await page.waitForLoadState('networkidle');
  expect(editRequests).toBe(1);
  expect((await db.task.findUnique({ where: { id: ids.firstBacklogTask } })).title).toBe(
    'Seed task 1',
  );
  await otherTab.close();
});

test('WEB-10: board and table show the same task identities and resolved custom columns', async ({
  page,
}) => {
  await signIn(page, 'alice');
  await page.getByRole('button', { name: /Open Backlog/ }).click();
  await expect(page.locator('.task-card')).toHaveCount(6);
  const cards = await page.locator('.task-card strong').allTextContents();
  await page.getByText('Table', { exact: true }).click();
  await expect(page.locator('.task-table-row')).toHaveCount(cards.length);
  const rows = await page.locator('.task-table-row strong').allTextContents();
  expect(rows.sort()).toEqual(cards.sort());
  await expect(page.getByRole('columnheader', { name: 'Effort' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Work type' })).toBeVisible();
});

test('WEB-05: a stale task save shows a conflict and keeps the unsaved draft', async ({ page }) => {
  await signIn(page, 'alice');
  await page.getByRole('button', { name: /Open Backlog/ }).click();
  await page.locator('.task-card').filter({ hasText: 'Seed task 1' }).click();
  const dialog = page.getByRole('dialog', { name: 'Task details' });
  await dialog.getByLabel('Title').fill('My unsaved draft');
  const actor = await login();
  const current = await db.task.findUnique({ where: { id: ids.firstBacklogTask } });
  await as(actor)
    .patch(`/v1/tasks/${current.id}`)
    .send({ expectedVersion: current.version, title: 'Concurrent edit' })
    .expect(200);
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Title')).toHaveValue('My unsaved draft');
  expect((await db.task.findUnique({ where: { id: current.id } })).title).toBe('Concurrent edit');
});

test('WEB-08 WEB-12 WEB-16 STATUS-12 STATUS-13: rejected status draft stays editable and previews its unsaved order', async ({
  page,
}) => {
  await signIn(page, 'alice');
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.locator('.workspace-main .ant-select').first().click();
  await page.getByText('list: Delivery', { exact: true }).click();
  await page.getByRole('tab', { name: 'Statuses' }).click();
  await expect(page.getByText('Local status set')).toBeVisible();
  await page.locator('.status-editor-row').nth(1).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Preview status flow' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Status flow preview' }).getByText('Building'),
  ).toHaveCount(0);
  await page
    .getByRole('dialog', { name: 'Status flow preview' })
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByRole('button', { name: 'Save full set' }).click();
  await expect(page.getByRole('alert')).toContainText('retained task');
  await expect(page.locator('.status-editor-row')).toHaveCount(3);
  expect(
    await db.status.count({ where: { statusSetId: '00000000-0000-4000-8000-000000000052' } }),
  ).toBe(4);
});

test('WEB-11: overview counts accessible tasks and opens a future-due task in its list', async ({
  page,
}) => {
  await db.task.update({
    where: { id: ids.firstBacklogTask },
    data: { dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  await signIn(page, 'alice');
  await expect(
    page.locator('.home-stat').filter({ hasText: 'Visible tasks' }).locator('strong'),
  ).toHaveText('24');
  const dueTask = page
    .locator('.home-section')
    .filter({ hasText: 'Upcoming due dates' })
    .getByRole('button')
    .filter({ hasText: 'Seed task 1' });
  await expect(dueTask).toBeVisible();
  await dueTask.click();
  await expect(page.getByRole('dialog', { name: 'Task details' }).getByLabel('Title')).toHaveValue(
    'Seed task 1',
  );
});

test('WEB-06: dragging a card to another status persists its new column', async ({ page }) => {
  await signIn(page, 'alice');
  await page.getByRole('button', { name: /Open Backlog/ }).click();
  const card = page.locator('.task-card').filter({ hasText: 'Seed task 1' });
  const done = page
    .locator('.kanban-column')
    .filter({ has: page.locator('.kanban-column-heading strong', { hasText: 'Done' }) });
  await card.dragTo(done);
  await expect
    .poll(async () => (await db.task.findUnique({ where: { id: ids.firstBacklogTask } })).statusKey)
    .toBe('done');
  await expect(done.locator('.task-card').filter({ hasText: 'Seed task 1' })).toBeVisible();
});

test('WEB-13: move dialog requires explicit source-only clear and keeps shared answers', async ({
  page,
}) => {
  await signIn(page, 'alice');
  await page.getByRole('button', { name: /Open Backlog/ }).click();
  await page.locator('.task-card').filter({ hasText: 'Seed task 1' }).click();
  await page
    .getByRole('dialog', { name: 'Task details' })
    .getByRole('button', { name: 'Move to another list' })
    .click();
  const move = page.getByRole('dialog', { name: 'Move Seed task 1' });
  await expect(move).toBeVisible({ timeout: 5000 });
  await move.locator('.ant-select').first().click({ timeout: 5000 });
  await page
    .locator('.ant-select-dropdown')
    .getByText('Delivery', { exact: true })
    .click({ timeout: 5000 });
  await expect(move.getByText('Clear Customer note from this task')).toBeVisible();
  await expect(move.getByRole('button', { name: 'Move task' })).toBeDisabled();
  await move.getByText('Clear Customer note from this task').click();
  await expect(move.getByRole('button', { name: 'Move task' })).toBeEnabled();
  await move.getByRole('button', { name: 'Move task' }).click();
  await expect
    .poll(
      async () => (await db.task.findUnique({ where: { id: ids.firstBacklogTask } })).primaryListId,
    )
    .toBe(ids.delivery);
  expect(
    await db.taskFieldValue.count({
      where: { taskId: ids.firstBacklogTask, fieldDefinitionId: ids.customerNote },
    }),
  ).toBe(0);
  expect(
    await db.taskFieldValue.count({
      where: { taskId: ids.firstBacklogTask, fieldDefinitionId: ids.effort },
    }),
  ).toBe(1);
});

test('WEB-22: public child of a private space stays absent from an unallowed member view', async ({
  page,
}) => {
  const alice = await login();
  const folder = await as(alice).post('/v1/containers').send({
    parentId: ids.product,
    type: 'folder',
    name: 'Public inside private',
    visibility: 'public',
  });
  expect(folder.status).toBe(201);
  await signIn(page, 'bob');
  await page
    .locator('.workspace-sidebar .workspace-home-link')
    .filter({ hasText: 'Create' })
    .click();
  await expect(page.getByText('Share a private parent first if needed.')).toBeVisible();
  await expect(page.getByText('Public inside private', { exact: true })).toHaveCount(0);
  expect(JSON.stringify((await as(await login('bob')).get('/v1/tree')).body)).not.toContain(
    folder.body.id,
  );
});

test('WEB-17: keyboard reorder of local fields persists without changing inherited fields', async ({
  page,
}) => {
  const alice = await login();
  const added = await as(alice)
    .post(`/v1/containers/${ids.backlog}/fields`)
    .send({ key: 'ui_note', name: 'UI note', type: 'text', required: false, options: [] });
  expect(added.status).toBe(201);
  await signIn(page, 'alice');
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.locator('.workspace-main .ant-select').first().click();
  await page.getByText('list: Backlog', { exact: true }).click();
  await page.getByRole('tab', { name: 'Fields' }).click();
  const list = page.getByRole('list', { name: 'Local fields in display order' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await list.getByRole('button', { name: /Drag UI note to reorder/ }).press('ArrowUp');
  await expect
    .poll(async () =>
      (
        await db.customFieldDefinition.findMany({
          where: { ownerContainerId: ids.backlog },
          orderBy: { position: 'asc' },
        })
      ).map((row) => row.key),
    )
    .toEqual(['ui_note', 'customer_note']);
  expect(
    (await db.customFieldDefinition.findUnique({ where: { id: ids.effort } })).ownerContainerId,
  ).toBe(ids.engineering);
});

test('WEB-21: creator shares an owned list from the UI and recipient gains access', async ({
  page,
}) => {
  const bob = await login('bob');
  const list = await as(bob)
    .post('/v1/containers')
    .send({ parentId: ids.q2, type: 'list', name: 'Bob share list', visibility: 'private' });
  expect(list.status).toBe(201);
  await signIn(page, 'bob');
  await page
    .locator('.workspace-sidebar .workspace-home-link')
    .filter({ hasText: 'Create' })
    .click();
  await page.getByRole('combobox', { name: 'Work area to share' }).click();
  await page.getByText('list: Bob share list', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Manage access' }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage access: Bob share list' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox').first().click();
  await page.locator('.ant-select-dropdown').getByText('Carol', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Save access' }).click();
  await expect
    .poll(() =>
      db.containerGrant.count({
        where: { containerId: list.body.id, userId: ids.carol, mode: 'allow' },
      }),
    )
    .toBe(1);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Account menu for Bob' }).click();
  await page.getByText('Sign Out', { exact: true }).click();
  await signIn(page, 'carol');
  await expect(
    page.locator('.workspace-sidebar').getByText('Bob share list', { exact: true }),
  ).toBeVisible();
});

test('WEB-07: task form preserves zero and false custom answers', async ({ page }) => {
  await signIn(page, 'alice');
  await page.locator('.workspace-sidebar').getByText('Delivery', { exact: true }).click();
  await page.getByRole('button', { name: 'New task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task' });
  await dialog.getByLabel('Title').fill('Zero and false from form');
  await dialog.getByLabel('Effort').fill('0');
  await dialog.getByLabel('Work type').click();
  await page.getByText('Feature', { exact: true }).last().click();
  const verified = dialog.getByRole('checkbox', { name: 'Yes' });
  await verified.check();
  await verified.uncheck();
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect.poll(() => db.task.count({ where: { title: 'Zero and false from form' } })).toBe(1);
  const task = await db.task.findFirst({
    where: { title: 'Zero and false from form' },
    include: { fieldValues: { include: { definition: true } } },
  });
  const values = Object.fromEntries(task.fieldValues.map((row) => [row.definition.key, row.value]));
  expect(values).toEqual(expect.objectContaining({ effort: 0, verified: false }));
});

test('WEB-03: concurrent 401 responses share one refresh and retry the original reads', async ({
  page,
}) => {
  await page.goto('/');
  expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(true);
  let treeRejected = false;
  let usersRejected = false;
  let refreshes = 0;
  await page.route('**/v1/tree', async (route) => {
    if (!treeRejected) {
      treeRejected = true;
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Expired for test' } }),
      });
    }
    return route.continue();
  });
  await page.route('**/v1/users?**', async (route) => {
    if (!usersRejected) {
      usersRejected = true;
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Expired for test' } }),
      });
    }
    return route.continue();
  });
  await page.route('**/v1/auth/refresh', async (route) => {
    refreshes++;
    return route.continue();
  });
  await page.getByLabel('Email').fill('alice@flowboard.com');
  await page.getByLabel('Password').fill('FlowboardDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Flowboard home' })).toBeVisible();
  await expect(page.locator('.workspace-sidebar')).toContainText('Backlog');
  expect(treeRejected).toBe(true);
  expect(usersRejected).toBe(true);
  expect(refreshes).toBe(1);
});

test('AUTH-12 WEB-09: an ambiguous refresh response clears the browser session without retrying', async ({
  page,
}) => {
  await signIn(page, 'alice');
  expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(true);
  let boardRejected = false;
  let refreshes = 0;
  await page.route('**/v1/lists/**/board?**', async (route) => {
    if (!boardRejected) {
      boardRejected = true;
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Expired for test' } }),
      });
    }
    return route.continue();
  });
  await page.route('**/v1/auth/refresh', async (route) => {
    refreshes++;
    return route.abort('failed');
  });
  await page.getByRole('button', { name: /Open Backlog/ }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(boardRejected).toBe(true);
  expect(refreshes).toBe(1);
});
