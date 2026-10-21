import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Priority } from '@prisma/client';
import { Container } from '@prisma/client';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { HierarchyService, DomainDb } from '../hierarchy/hierarchy.service';
import { AuthService } from '../identity/auth.service';
import { PermissionsService, DomainActor } from '../permissions/permissions.service';
import { PrismaService } from '../persistence/prisma.service';
import { StatusesService } from '../statuses/statuses.service';
import { StoredTask, TasksService } from '../tasks/tasks.service';

type Input = Record<string, unknown>;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly hierarchy: HierarchyService,
    private readonly permissions: PermissionsService,
    private readonly statuses: StatusesService,
    private readonly fields: CustomFieldsService,
    private readonly tasks: TasksService,
  ) {}

  private async resolved(workspaceId: string, path: Container[], db: DomainDb) {
    const status = await this.statuses.resolve(workspaceId, path, db);
    const fields = await this.fields.resolve(workspaceId, path, db);
    return { ...status, ...fields };
  }

  private object(value: unknown): Input {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Expected a JSON object.');
    return value as Input;
  }

  private only(input: Input, keys: string[]) {
    for (const key of Object.keys(input))
      if (!keys.includes(key)) throw new BadRequestException(`Unknown field: ${key}.`);
  }

  private version(value: unknown, task: StoredTask) {
    if (!Number.isInteger(value) || (value as number) < 1)
      throw new BadRequestException('expectedVersion is required.');
    if (value !== task.version)
      throw new ConflictException('Task has changed. Reload and try again.');
  }

  private async lock(actor: DomainActor, db: DomainDb) {
    await db.$queryRaw`SELECT id FROM workspaces WHERE id = ${actor.workspaceId}::uuid FOR UPDATE`;
    return this.auth.freshActor(actor, db);
  }

  private async task(actor: DomainActor, id: string, db: DomainDb) {
    const task = await this.tasks.get(id, db);
    if (!task || task.workspaceId !== actor.workspaceId || task.archivedAt)
      throw new NotFoundException('Task is unavailable.');
    await this.permissions.assertList(actor, task.primaryListId, db);
    return task;
  }

  private values(task: StoredTask | null) {
    return Object.fromEntries(
      (task?.fieldValues ?? []).map((item) => [item.definition.key, item.value]),
    ) as Input;
  }

  private patchValues(current: Input, patch: unknown) {
    if (patch === undefined) return current;
    const next = { ...current };
    for (const [key, value] of Object.entries(this.object(patch))) {
      if (value === null) delete next[key];
      else next[key] = value;
    }
    return next;
  }

  private answerRows(values: Input, fields: Array<{ id: string; key: string }>) {
    return fields
      .filter((field) => values[field.key] !== undefined && values[field.key] !== null)
      .map((field) => ({
        definitionId: field.id,
        value: values[field.key] as Prisma.InputJsonValue,
      }));
  }

  private async assignees(actor: DomainActor, value: unknown, fallback: string[], db: DomainDb) {
    if (value === undefined) return fallback;
    if (
      !Array.isArray(value) ||
      value.some((id) => typeof id !== 'string') ||
      new Set(value).size !== value.length
    )
      throw new BadRequestException('assigneeIds must be distinct user IDs.');
    if (!value.length) return [];
    const eligible = await this.auth.eligibleAssigneeIds(actor.workspaceId, value, db);
    if (eligible.length !== value.length)
      throw new BadRequestException('One or more assignees are not active workspace members.');
    return value as string[];
  }

  private builtins(input: Input, task: StoredTask | null) {
    const title = input.title === undefined ? task?.title : input.title;
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 500)
      throw new BadRequestException('title must contain 1–500 characters.');
    const description =
      input.description === undefined ? (task?.description ?? null) : input.description;
    if (description !== null && typeof description !== 'string')
      throw new BadRequestException('description must be text or null.');
    const priority =
      input.priority === undefined ? (task?.priority ?? Priority.none) : input.priority;
    if (typeof priority !== 'string' || !Object.values(Priority).includes(priority as Priority))
      throw new BadRequestException('priority is invalid.');
    let dueDate = task?.dueDate ?? null;
    if (input.dueDate !== undefined) {
      if (input.dueDate === null) dueDate = null;
      else {
        if (typeof input.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(input.dueDate))
          throw new BadRequestException('dueDate must be an ISO datetime.');
        dueDate = new Date(input.dueDate);
        if (Number.isNaN(dueDate.getTime()))
          throw new BadRequestException('dueDate must be an ISO datetime.');
      }
    }
    return { title: title.trim(), description, priority: priority as Priority, dueDate };
  }

  async tree(actor: DomainActor) {
    const nodes = await this.permissions.filteredTree(actor);
    return {
      workspaceId: actor.workspaceId,
      items: nodes.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        parentContainerId: node.parentContainerId,
      })),
    };
  }

  async overview(actor: DomainActor, workspaceId: string) {
    if (workspaceId !== actor.workspaceId) throw new NotFoundException('Workspace is unavailable.');
    const now = new Date();
    const through = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return this.prisma.$transaction(
      async (db) => {
        const nodes = await this.permissions.filteredTree(actor, db);
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const orderedLists: Container[] = [];
        const visit = (parentId: string | null) => {
          for (const node of nodes.filter((item) => item.parentContainerId === parentId)) {
            if (node.type === 'list') orderedLists.push(node);
            else visit(node.id);
          }
        };
        visit(null);
        const lists = orderedLists.map((node) => {
          const path: Container[] = [];
          let current: Container | undefined = node;
          while (current) {
            path.unshift(current);
            current = current.parentContainerId ? byId.get(current.parentContainerId) : undefined;
          }
          return {
            id: node.id,
            name: node.name,
            path: path.map((part) => ({ id: part.id, name: part.name, type: part.type })),
          };
        });
        const summary = await this.tasks.overview(
          actor.workspaceId,
          lists.map((list) => list.id),
          now,
          through,
          db,
        );
        const listRows = lists.map((list) => ({
          ...list,
          taskCount: summary.counts.get(list.id) ?? 0,
        }));
        return {
          workspaceId: actor.workspaceId,
          totals: {
            visibleTasks: listRows.reduce((total, list) => total + list.taskCount, 0),
            accessibleLists: listRows.length,
            dueSoon: summary.dueSoon,
          },
          dueSoonWindow: { startsAt: now.toISOString(), endsBefore: through.toISOString() },
          lists: listRows,
          upcoming: summary.upcoming.map((task) => ({
            id: task.id,
            title: task.title,
            primaryListId: task.primaryListId,
            dueDate: task.dueDate.toISOString(),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async board(actor: DomainActor, listId: string, offset = 0, limit = 50) {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('Invalid pagination.');
    return this.prisma.$transaction(
      async (db) => {
        const path = await this.permissions.assertList(actor, listId, db);
        const resolved = await this.resolved(actor.workspaceId, path, db);
        const all = await this.tasks.list(listId, db);
        const order = new Map(resolved.statuses.map((status, index) => [status.key, index]));
        all.sort(
          (a, b) =>
            (order.get(a.statusKey) ?? 999) - (order.get(b.statusKey) ?? 999) ||
            a.position.comparedTo(b.position) ||
            a.id.localeCompare(b.id),
        );
        return {
          list: {
            id: listId,
            name: path.at(-1)?.name,
            path: path.map((node) => ({ id: node.id, name: node.name, type: node.type })),
          },
          statuses: resolved.statuses,
          statusSource: resolved.statusSource,
          fields: resolved.fields,
          items: all.slice(offset, offset + limit).map((task) => this.tasks.project(task)),
          page: { offset, limit, total: all.length, hasMore: offset + limit < all.length },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async detail(actor: DomainActor, id: string) {
    return this.tasks.project(await this.task(actor, id, this.prisma));
  }

  async create(actor: DomainActor, listId: string, body: unknown) {
    const input = this.object(body);
    this.only(input, [
      'title',
      'description',
      'statusKey',
      'priority',
      'dueDate',
      'assigneeIds',
      'customFields',
    ]);
    return this.prisma.$transaction(async (db) => {
      const fresh = await this.lock(actor, db);
      const path = await this.permissions.assertList(fresh, listId, db);
      const resolved = await this.resolved(fresh.workspaceId, path, db);
      const builtins = this.builtins(input, null);
      const statusKey = this.statuses.validate(input.statusKey, resolved.statuses);
      const values = this.patchValues({}, input.customFields);
      this.fields.validate(values, resolved.rawFields);
      const assigneeIds = await this.assignees(fresh, input.assigneeIds, [], db);
      const task = await this.tasks.create(
        {
          workspaceId: fresh.workspaceId,
          listId,
          creatorId: fresh.userId,
          ...builtins,
          statusKey,
          assigneeIds,
          values: this.answerRows(values, resolved.rawFields),
        },
        db,
      );
      return this.tasks.project(task);
    });
  }

  async update(actor: DomainActor, id: string, body: unknown) {
    const input = this.object(body);
    this.only(input, [
      'expectedVersion',
      'title',
      'description',
      'statusKey',
      'priority',
      'dueDate',
      'assigneeIds',
      'customFields',
    ]);
    return this.prisma.$transaction(async (db) => {
      const fresh = await this.lock(actor, db);
      const task = await this.task(fresh, id, db);
      this.version(input.expectedVersion, task);
      const path = await this.hierarchy.listPath(fresh.workspaceId, task.primaryListId, db);
      const resolved = await this.resolved(fresh.workspaceId, path, db);
      const statusKey = this.statuses.validate(
        input.statusKey ?? task.statusKey,
        resolved.statuses,
      );
      const values = this.patchValues(this.values(task), input.customFields);
      this.fields.validate(values, resolved.rawFields);
      const builtins = this.builtins(input, task);
      const assigneeIds = await this.assignees(
        fresh,
        input.assigneeIds,
        task.assignees.map((item) => item.userId),
        db,
      );
      let position: number | undefined;
      if (statusKey !== task.statusKey) {
        position =
          (await this.tasks.place(task, task.primaryListId, statusKey, undefined, db)) ?? undefined;
      }
      const saved = await this.tasks.update(
        task,
        {
          listId: task.primaryListId,
          ...builtins,
          statusKey,
          assigneeIds,
          values: this.answerRows(values, resolved.rawFields),
          position,
        },
        db,
      );
      return this.tasks.project(saved);
    });
  }

  async placement(actor: DomainActor, id: string, body: unknown) {
    const input = this.object(body);
    this.only(input, ['expectedVersion', 'statusKey', 'beforeTaskId']);
    return this.prisma.$transaction(async (db) => {
      const fresh = await this.lock(actor, db);
      const task = await this.task(fresh, id, db);
      this.version(input.expectedVersion, task);
      const path = await this.hierarchy.listPath(fresh.workspaceId, task.primaryListId, db);
      const resolved = await this.resolved(fresh.workspaceId, path, db);
      const statusKey = this.statuses.validate(input.statusKey, resolved.statuses);
      if (input.beforeTaskId !== undefined && typeof input.beforeTaskId !== 'string')
        throw new BadRequestException('beforeTaskId is invalid.');
      const position = await this.tasks.place(
        task,
        task.primaryListId,
        statusKey,
        input.beforeTaskId as string | undefined,
        db,
      );
      if (position === null)
        throw new BadRequestException('Placement anchor is not in the destination column.');
      const saved = await this.tasks.update(
        task,
        {
          listId: task.primaryListId,
          title: task.title,
          description: task.description,
          statusKey,
          priority: task.priority,
          dueDate: task.dueDate,
          assigneeIds: task.assignees.map((item) => item.userId),
          values: this.answerRows(this.values(task), resolved.rawFields),
          position,
        },
        db,
      );
      return this.tasks.project(saved);
    });
  }

  async move(actor: DomainActor, id: string, body: unknown) {
    const input = this.object(body);
    this.only(input, [
      'expectedVersion',
      'destinationListId',
      'statusKey',
      'customFields',
      'beforeTaskId',
    ]);
    if (typeof input.destinationListId !== 'string')
      throw new BadRequestException('destinationListId is required.');
    return this.prisma.$transaction(async (db) => {
      const fresh = await this.lock(actor, db);
      const task = await this.task(fresh, id, db);
      this.version(input.expectedVersion, task);
      if (input.destinationListId === task.primaryListId)
        throw new BadRequestException('Choose a different destination list.');
      const destination = await this.permissions.assertList(
        fresh,
        input.destinationListId as string,
        db,
      );
      const resolved = await this.resolved(fresh.workspaceId, destination, db);
      const statusKey = this.statuses.validate(
        input.statusKey ?? task.statusKey,
        resolved.statuses,
      );
      const patch = input.customFields === undefined ? {} : this.object(input.customFields);
      const destinationKeys = new Set(resolved.rawFields.map((field) => field.key));
      const existing = this.values(task);
      for (const key of Object.keys(existing))
        if (!destinationKeys.has(key) && patch[key] !== null)
          throw new BadRequestException(
            `customFields.${key}: explicitly clear this source-only value.`,
          );
      const shared = Object.fromEntries(
        Object.entries(existing).filter(([key]) => destinationKeys.has(key)),
      );
      const values = this.patchValues(shared, patch);
      // A null for a source-only value acknowledges its removal; it is not a destination answer.
      for (const key of Object.keys(values)) if (!destinationKeys.has(key)) delete values[key];
      for (const [key, value] of Object.entries(patch))
        if (!destinationKeys.has(key) && (key in existing ? value !== null : true))
          throw new BadRequestException(`customFields.${key}: unknown destination field.`);
      this.fields.validate(values, resolved.rawFields);
      if (input.beforeTaskId !== undefined && typeof input.beforeTaskId !== 'string')
        throw new BadRequestException('beforeTaskId is invalid.');
      const position = await this.tasks.place(
        task,
        input.destinationListId as string,
        statusKey,
        input.beforeTaskId as string | undefined,
        db,
      );
      if (position === null)
        throw new BadRequestException('Placement anchor is not in the destination column.');
      const saved = await this.tasks.update(
        task,
        {
          listId: input.destinationListId as string,
          title: task.title,
          description: task.description,
          statusKey,
          priority: task.priority,
          dueDate: task.dueDate,
          assigneeIds: task.assignees.map((item) => item.userId),
          values: this.answerRows(values, resolved.rawFields),
          position,
        },
        db,
      );
      return this.tasks.project(saved);
    });
  }

  async archive(actor: DomainActor, id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (db) => {
      const fresh = await this.lock(actor, db);
      const task = await this.task(fresh, id, db);
      this.version(expectedVersion, task);
      await this.tasks.archive(task, db);
    });
  }
}
