import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContainerType, FieldType, GrantMode, Prisma, Priority, Visibility } from '@prisma/client';
import { Container } from '@prisma/client';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { HierarchyService, DomainDb } from '../hierarchy/hierarchy.service';
import { AuthService } from '../identity/auth.service';
import { PermissionsService, DomainActor } from '../permissions/permissions.service';
import { PrismaService } from '../persistence/prisma.service';
import { StatusesService } from '../statuses/statuses.service';
import { StoredTask, TasksService } from '../tasks/tasks.service';

type Input = Record<string, unknown>;

/** Coordinates access, effective config, and cross-domain writes in one transaction. */
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

  /** Loads the effective statuses and fields for one container path. */
  private async resolved(workspaceId: string, path: Container[], db: DomainDb) {
    const status = await this.statuses.resolve(workspaceId, path, db);
    const fields = await this.fields.resolve(workspaceId, path, db);
    return { ...status, ...fields };
  }

  /** Requires a plain JSON object before reading request fields. */
  private object(value: unknown): Input {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Expected a JSON object.');
    return value as Input;
  }

  /** Rejects request properties outside this operation’s accepted shape. */
  private only(input: Input, keys: string[]) {
    for (const key of Object.keys(input))
      if (!keys.includes(key)) throw new BadRequestException(`Unknown field: ${key}.`);
  }

  /** Rejects a stale task version before applying a change. */
  private version(value: unknown, task: StoredTask) {
    if (!Number.isInteger(value) || (value as number) < 1)
      throw new BadRequestException('expectedVersion is required.');
    if (value !== task.version)
      throw new ConflictException('Task has changed. Reload and try again.');
  }

  /** Locks the workspace row and reloads the caller’s role to serialize writes. */
  private async lock(actor: DomainActor, db: DomainDb) {
    await db.$queryRaw`SELECT id FROM workspaces WHERE id = ${actor.workspaceId}::uuid FOR UPDATE`;
    return this.auth.freshActor(actor, db);
  }

  /** Uses the write lock, then requires current admin membership. */
  private async admin(actor: DomainActor, db: DomainDb) {
    const fresh = await this.lock(actor, db);
    this.permissions.assertAdmin(fresh);
    return fresh;
  }

  /** Accepts and trims a nonempty name within the length limit. */
  private name(value: unknown) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 200)
      throw new BadRequestException('name must contain 1–200 characters.');
    return value.trim();
  }

  /** Checks that offset and page size are within supported limits. */
  private page(offset: number, limit: number) {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('Invalid pagination.');
  }

  /** Checks an ID’s UUID shape before using it in a workflow. */
  private uuid(value: unknown, field: string) {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    )
      throw new BadRequestException(`${field} must be a UUID.`);
    return value;
  }

  /** Shapes a stored container for API responses. */
  private containerView(node: Container) {
    return {
      id: node.id,
      workspaceId: node.workspaceId,
      parentContainerId: node.parentContainerId,
      type: node.type,
      name: node.name,
      visibility: node.visibility,
      position: node.position.toNumber(),
      archivedAt: node.archivedAt,
    };
  }

  /** Returns only the workspace belonging to the caller. */
  async workspace(actor: DomainActor, id: string) {
    if (id !== actor.workspaceId) throw new NotFoundException('Workspace is unavailable.');
    return this.hierarchy.workspace(id);
  }

  /** Validates and renames the caller’s workspace as an admin write. */
  async renameWorkspace(actor: DomainActor, id: string, body: unknown) {
    const input = this.object(body);
    this.only(input, ['name']);
    const name = this.name(input.name);
    if (id !== actor.workspaceId) throw new NotFoundException('Workspace is unavailable.');
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      return this.hierarchy.renameWorkspace(id, name, db);
    });
  }

  /** Pages through containers the caller can access. */
  async containers(actor: DomainActor, offset: number, limit: number) {
    this.page(offset, limit);
    const items = await this.permissions.filteredTree(actor);
    return {
      items: items.slice(offset, offset + limit).map((node) => this.containerView(node)),
      page: { offset, limit, total: items.length, hasMore: offset + limit < items.length },
    };
  }

  /** Returns a container after checking its full path. */
  async container(actor: DomainActor, id: string) {
    const path = await this.hierarchy.path(actor.workspaceId, id);
    await this.permissions.assertPath(actor, path);
    return this.containerView(path.at(-1)!);
  }

  /** Creates a container under the permitted space → folder → list hierarchy. */
  async createContainer(actor: DomainActor, body: unknown) {
    const input = this.object(body);
    this.only(input, ['parentId', 'type', 'name', 'visibility']);
    const name = this.name(input.name);
    if (!Object.values(ContainerType).includes(input.type as ContainerType))
      throw new BadRequestException('Invalid container type.');
    if (
      input.visibility !== undefined &&
      !Object.values(Visibility).includes(input.visibility as Visibility)
    )
      throw new BadRequestException('Invalid visibility.');
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      const parent =
        input.parentId === null || input.parentId === undefined
          ? null
          : (
              await this.hierarchy.path(
                actor.workspaceId,
                this.uuid(input.parentId, 'parentId'),
                db,
              )
            ).at(-1)!;
      const type = input.type as ContainerType;
      if (
        (type === ContainerType.space && parent) ||
        (type === ContainerType.folder && parent?.type !== ContainerType.space) ||
        (type === ContainerType.list && parent?.type !== ContainerType.folder)
      )
        throw new BadRequestException('Container parent/type path is invalid.');
      return this.containerView(
        await this.hierarchy.create(
          actor.workspaceId,
          parent,
          type,
          name,
          (input.visibility ?? Visibility.public) as Visibility,
          db,
        ),
      );
    });
  }

  /** Changes a live container’s name or visibility as an admin write. */
  async updateContainer(actor: DomainActor, id: string, body: unknown) {
    const input = this.object(body);
    this.only(input, ['name', 'visibility']);
    if (!Object.keys(input).length) throw new BadRequestException('No changes supplied.');
    if (
      input.visibility !== undefined &&
      !Object.values(Visibility).includes(input.visibility as Visibility)
    )
      throw new BadRequestException('Invalid visibility.');
    const data = {
      ...(input.name !== undefined ? { name: this.name(input.name) } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility as Visibility } : {}),
    };
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      await this.hierarchy.path(actor.workspaceId, id, db);
      return this.containerView(await this.hierarchy.update(id, data, db));
    });
  }

  /** Archives a live container; descendants remain retained for safety checks. */
  async archiveContainer(actor: DomainActor, id: string) {
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      await this.hierarchy.path(actor.workspaceId, id, db);
      await this.hierarchy.update(id, { archivedAt: new Date() }, db);
    });
  }

  /** Reorders all live siblings under one parent as an admin write. */
  async reorderContainers(actor: DomainActor, body: unknown) {
    const input = this.object(body);
    this.only(input, ['parentId', 'ids']);
    if (input.parentId !== null) this.uuid(input.parentId, 'parentId');
    if (!Array.isArray(input.ids) || input.ids.some((id) => typeof id !== 'string'))
      throw new BadRequestException('ids must be an array of IDs.');
    input.ids.forEach((id) => this.uuid(id, 'ids item'));
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      if (input.parentId)
        await this.hierarchy.path(actor.workspaceId, input.parentId as string, db);
      await this.hierarchy.reorder(
        actor.workspaceId,
        input.parentId as string | null,
        input.ids as string[],
        db,
      );
    });
  }

  /** Shows direct access rules on a live container to an admin. */
  async grants(actor: DomainActor, id: string) {
    this.permissions.assertAdmin(actor);
    await this.hierarchy.path(actor.workspaceId, id);
    return {
      items: (await this.permissions.grants(actor.workspaceId, id, this.prisma)).map((grant) => ({
        userId: grant.userId,
        mode: grant.mode,
      })),
    };
  }

  /** Sets a direct rule for an active workspace member on a live container. */
  async putGrant(actor: DomainActor, id: string, userId: string, body: unknown) {
    const input = this.object(body);
    this.only(input, ['mode']);
    if (!Object.values(GrantMode).includes(input.mode as GrantMode))
      throw new BadRequestException('mode must be allow or deny.');
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      await this.hierarchy.path(actor.workspaceId, id, db);
      const eligible = await this.auth.eligibleAssigneeIds(actor.workspaceId, [userId], db);
      if (!eligible.length)
        throw new BadRequestException('Target must be an active workspace member.');
      return this.permissions.putGrant(actor.workspaceId, id, userId, input.mode as GrantMode, db);
    });
  }

  /** Removes a direct container rule as an admin write. */
  async deleteGrant(actor: DomainActor, id: string, userId: string) {
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      await this.hierarchy.path(actor.workspaceId, id, db);
      await this.permissions.deleteGrant(actor.workspaceId, id, userId, db);
    });
  }

  /** Shows the local menu and the menu this owner would inherit. */
  async statusSet(actor: DomainActor, ownerId: string | null) {
    if (ownerId) {
      const path = await this.hierarchy.path(actor.workspaceId, ownerId);
      await this.permissions.assertPath(actor, path);
      const local = await this.statuses.local(actor.workspaceId, ownerId);
      const inherited = await this.statuses.resolve(
        actor.workspaceId,
        path.slice(0, -1),
        this.prisma,
      );
      return { local, inherited };
    }
    return { local: await this.statuses.local(actor.workspaceId, null), inherited: null };
  }

  /** Finds retained lists that use an owner’s menu; nearer overrides shield descendants. */
  private async statusAffected(workspaceId: string, ownerId: string | null, db: DomainDb) {
    const paths = await this.hierarchy.retainedListPaths(workspaceId, db);
    const affected: string[] = [];
    for (const path of paths) {
      const index = ownerId === null ? -1 : path.findIndex((node) => node.id === ownerId);
      if (ownerId !== null && index < 0) continue;
      let shielded = false;
      for (const node of path.slice(index + 1)) {
        if (await this.statuses.local(workspaceId, node.id, db)) {
          shielded = true;
          break;
        }
      }
      if (!shielded) affected.push(path.at(-1)!.id);
    }
    return affected;
  }

  /** Saves a menu only if every affected retained task keeps a valid status key. */
  async putStatusSet(actor: DomainActor, ownerId: string | null, body: unknown) {
    const input = this.object(body);
    this.only(input, ['statuses']);
    const rows = this.statuses.candidate(input.statuses);
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      if (ownerId) await this.hierarchy.path(actor.workspaceId, ownerId, db);
      const affected = await this.statusAffected(actor.workspaceId, ownerId, db);
      const retained = await this.tasks.retained(actor.workspaceId, affected, db);
      const keys = new Set(rows.map((row) => row.key));
      const blocked = retained.filter((task) => !keys.has(task.statusKey));
      if (blocked.length)
        throw new ConflictException(
          `${blocked.length} retained task(s) use statuses missing from the proposed set.`,
        );
      return this.statuses.put(actor.workspaceId, ownerId, rows, db);
    });
  }

  /** Restores inherited statuses only if affected retained tasks still fit that menu. */
  async resetStatusSet(actor: DomainActor, ownerId: string) {
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      const path = await this.hierarchy.path(actor.workspaceId, ownerId, db);
      const inherited = await this.statuses.resolve(actor.workspaceId, path.slice(0, -1), db);
      const affected = await this.statusAffected(actor.workspaceId, ownerId, db);
      const retained = await this.tasks.retained(actor.workspaceId, affected, db);
      const keys = new Set(inherited.statuses.map((row) => row.key));
      const blocked = retained.filter((task) => !keys.has(task.statusKey));
      if (blocked.length)
        throw new ConflictException(
          `${blocked.length} retained task(s) use statuses missing from the inherited set.`,
        );
      await this.statuses.reset(actor.workspaceId, ownerId, db);
    });
  }

  /** Pages through fields defined on an accessible container. */
  async localFields(actor: DomainActor, ownerId: string, offset: number, limit: number) {
    this.page(offset, limit);
    const path = await this.hierarchy.path(actor.workspaceId, ownerId);
    await this.permissions.assertPath(actor, path);
    return this.fields.local(actor.workspaceId, ownerId, offset, limit);
  }

  /** Finds retained tasks below a field owner, including archived branches. */
  private async fieldTasks(workspaceId: string, ownerId: string, db: DomainDb) {
    const paths = await this.hierarchy.retainedListPaths(workspaceId, db);
    return this.tasks.retained(
      workspaceId,
      paths
        .filter((path) => path.some((node) => node.id === ownerId))
        .map((path) => path.at(-1)!.id),
      db,
    );
  }

  /** Adds a unique field; a new required field cannot strand existing tasks. */
  async createField(actor: DomainActor, ownerId: string, body: unknown) {
    const candidate = this.fields.candidate(body);
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      await this.hierarchy.path(actor.workspaceId, ownerId, db);
      const existing = await this.fields.findByKey(actor.workspaceId, candidate.key, db);
      if (existing) throw new ConflictException('Field key already exists in this workspace.');
      if (candidate.required && (await this.fieldTasks(actor.workspaceId, ownerId, db)).length)
        throw new ConflictException(
          'Existing retained tasks need a value before this field can be required.',
        );
      return this.fields.create(actor.workspaceId, ownerId, candidate, db);
    });
  }

  /** Changes a field only when retained answers still fit its type, options, and required rule. */
  async updateField(actor: DomainActor, id: string, body: unknown) {
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      const previous = await this.fields.get(actor.workspaceId, id, db);
      if (!previous) throw new NotFoundException('Field is unavailable.');
      await this.hierarchy.path(actor.workspaceId, previous.ownerContainerId, db);
      const candidate = this.fields.candidate(body, previous);
      const retained = await this.fieldTasks(actor.workspaceId, previous.ownerContainerId, db);
      const used = retained
        .flatMap((task) => task.fieldValues)
        .filter((value) => value.fieldDefinitionId === id);
      if (used.length && candidate.type !== previous.type)
        throw new ConflictException('Field type cannot change while values exist.');
      const optionIds = new Set(candidate.options.map((option) => option.id));
      if (
        used.some((row) => {
          const values = Array.isArray(row.value) ? row.value : [row.value];
          return values.some((value) => typeof value === 'string' && !optionIds.has(value));
        }) &&
        (candidate.type === FieldType.single_select || candidate.type === FieldType.multi_select)
      )
        throw new ConflictException('A removed option is still used by retained tasks.');
      if (
        candidate.required &&
        retained.some(
          (task) =>
            !task.fieldValues.some(
              (value) =>
                value.fieldDefinitionId === id &&
                this.fields.isAnswered(candidate.type, value.value),
            ),
        )
      )
        throw new ConflictException('Retained tasks are missing a required value.');
      return this.fields.update(id, candidate, db);
    });
  }

  /** Deletes a field only when no retained task still answers it. */
  async deleteField(actor: DomainActor, id: string) {
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      const previous = await this.fields.get(actor.workspaceId, id, db);
      if (!previous) throw new NotFoundException('Field is unavailable.');
      await this.hierarchy.path(actor.workspaceId, previous.ownerContainerId, db);
      const retained = await this.fieldTasks(actor.workspaceId, previous.ownerContainerId, db);
      if (retained.some((task) => task.fieldValues.some((value) => value.fieldDefinitionId === id)))
        throw new ConflictException('A retained task still uses this field.');
      await this.fields.delete(id, db);
    });
  }

  /** Reorders every field owned by one container as an admin write. */
  async reorderFields(actor: DomainActor, ownerId: string, body: unknown) {
    const input = this.object(body);
    this.only(input, ['ids']);
    if (!Array.isArray(input.ids) || input.ids.some((id) => typeof id !== 'string'))
      throw new BadRequestException('ids must be an array of IDs.');
    input.ids.forEach((id) => this.uuid(id, 'ids item'));
    return this.prisma.$transaction(async (db) => {
      await this.admin(actor, db);
      await this.hierarchy.path(actor.workspaceId, ownerId, db);
      await this.fields.reorder(actor.workspaceId, ownerId, input.ids as string[], db);
    });
  }

  /** Loads a live task only after checking access to its actual list. */
  private async task(actor: DomainActor, id: string, db: DomainDb) {
    const task = await this.tasks.get(id, db);
    if (!task || task.workspaceId !== actor.workspaceId || task.archivedAt)
      throw new NotFoundException('Task is unavailable.');
    await this.permissions.assertList(actor, task.primaryListId, db);
    return task;
  }

  /** Maps stored custom field answers back to field keys. */
  private values(task: StoredTask | null) {
    return Object.fromEntries(
      (task?.fieldValues ?? []).map((item) => [item.definition.key, item.value]),
    ) as Input;
  }

  /** Merges submitted answers; null explicitly clears an answer. */
  private patchValues(current: Input, patch: unknown) {
    if (patch === undefined) return current;
    const next = { ...current };
    for (const [key, value] of Object.entries(this.object(patch))) {
      if (value === null) delete next[key];
      else next[key] = value;
    }
    return next;
  }

  /** Converts keyed answers into rows tied to field definition IDs. */
  private answerRows(values: Input, fields: Array<{ id: string; key: string }>) {
    return fields
      .filter((field) => values[field.key] !== undefined && values[field.key] !== null)
      .map((field) => ({
        definitionId: field.id,
        value: values[field.key] as Prisma.InputJsonValue,
      }));
  }

  /** Keeps existing assignees when omitted; otherwise requires distinct active members. */
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

  /** Validates task title, description, priority, and due date with current values as defaults. */
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

  /** Returns the hierarchy visible to the caller. */
  async tree(actor: DomainActor) {
    const nodes = await this.permissions.filteredTree(actor);
    return {
      workspaceId: actor.workspaceId,
      items: nodes.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        parentContainerId: node.parentContainerId,
        visibility: node.visibility,
        position: node.position.toNumber(),
      })),
    };
  }

  /** Builds counts and due-date summaries from accessible lists in one read snapshot. */
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

  /** Loads a list’s effective config and ordered tasks in one read snapshot. */
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

  /** Returns one accessible live task in the public response shape. */
  async detail(actor: DomainActor, id: string) {
    return this.tasks.project(await this.task(actor, id, this.prisma));
  }

  /** Creates a task after checking current access, status, fields, and assignees in one transaction. */
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

  /** Updates a task against its version and current list rules in one transaction. */
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

  /** Moves a task within its list or status columns, checking its version and anchor. */
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

  /** Moves a task between accessible lists. Source-only answers need an explicit clear. */
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

  /** Archives a task after checking access and its expected version. */
  async archive(actor: DomainActor, id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (db) => {
      const fresh = await this.lock(actor, db);
      const task = await this.task(fresh, id, db);
      this.version(expectedVersion, task);
      await this.tasks.archive(task, db);
    });
  }
}
