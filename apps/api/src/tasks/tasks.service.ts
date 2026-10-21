import { Injectable } from '@nestjs/common';
import { Prisma, Priority } from '@prisma/client';
import { DomainDb } from '../hierarchy/hierarchy.service';
import { PrismaService } from '../persistence/prisma.service';

const taskInclude = {
  assignees: { include: { user: true } },
  fieldValues: { include: { definition: true } },
} as const;
export type StoredTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

/** Stores tasks and their ordering, assignees, and field answers. */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Loads a task with its assignees and custom field answers. */
  get(id: string, db: DomainDb = this.prisma) {
    return db.task.findUnique({ where: { id }, include: taskInclude });
  }

  /** Lists live tasks in one list, ordered by position. */
  async list(listId: string, db: DomainDb = this.prisma) {
    return db.task.findMany({
      where: { primaryListId: listId, archivedAt: null },
      include: taskInclude,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  /** Loads tasks in selected lists, including archived tasks for config safety checks. */
  async retained(workspaceId: string, listIds: string[], db: DomainDb) {
    if (!listIds.length) return [];
    return db.task.findMany({
      where: { workspaceId, primaryListId: { in: listIds } },
      include: taskInclude,
    });
  }

  /** Counts visible-list tasks and finds upcoming due dates within the supplied window. */
  async overview(workspaceId: string, listIds: string[], now: Date, through: Date, db: DomainDb) {
    if (!listIds.length)
      return {
        counts: new Map<string, number>(),
        dueSoon: 0,
        upcoming: [] as Array<{ id: string; title: string; primaryListId: string; dueDate: Date }>,
      };
    const scope = { workspaceId, primaryListId: { in: listIds }, archivedAt: null };
    const [grouped, dueSoon, upcoming] = await Promise.all([
      db.task.groupBy({ by: ['primaryListId'], where: scope, _count: { _all: true } }),
      db.task.count({ where: { ...scope, dueDate: { gte: now, lt: through } } }),
      db.task.findMany({
        where: { ...scope, dueDate: { gte: now } },
        select: { id: true, title: true, primaryListId: true, dueDate: true },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
    ]);
    return {
      counts: new Map(grouped.map((row) => [row.primaryListId, row._count._all])),
      dueSoon,
      upcoming: upcoming.map((task) => ({ ...task, dueDate: task.dueDate! })),
    };
  }

  /** Shapes a stored task into the public task response. */
  project(task: StoredTask) {
    return {
      id: task.id,
      primaryListId: task.primaryListId,
      title: task.title,
      description: task.description,
      statusKey: task.statusKey,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() ?? null,
      position: task.position.toNumber(),
      version: task.version,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      createdByUserId: task.createdByUserId,
      assignees: task.assignees.map((item) => ({ id: item.userId, name: item.user.displayName })),
      customFields: Object.fromEntries(
        task.fieldValues.map((item) => [item.definition.key, item.value]),
      ),
    };
  }

  /** Finds the next position at the end of a list’s status column. */
  async nextPosition(listId: string, statusKey: string, db: DomainDb) {
    const last = await db.task.findFirst({
      where: { primaryListId: listId, statusKey, archivedAt: null },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
    return last ? last.position.toNumber() + 1 : 1;
  }

  /** Stores a new task, assignees, and field answers in one write. */
  async create(
    args: {
      workspaceId: string;
      listId: string;
      creatorId: string;
      title: string;
      description: string | null;
      statusKey: string;
      priority: Priority;
      dueDate: Date | null;
      assigneeIds: string[];
      values: Array<{ definitionId: string; value: Prisma.InputJsonValue }>;
    },
    db: DomainDb,
  ) {
    const position = await this.nextPosition(args.listId, args.statusKey, db);
    const task = await db.task.create({
      data: {
        workspaceId: args.workspaceId,
        primaryListId: args.listId,
        createdByUserId: args.creatorId,
        title: args.title,
        description: args.description,
        statusKey: args.statusKey,
        priority: args.priority,
        dueDate: args.dueDate,
        position,
      },
    });
    if (args.assigneeIds.length)
      await db.taskAssignee.createMany({
        data: args.assigneeIds.map((userId) => ({
          taskId: task.id,
          userId,
          workspaceId: args.workspaceId,
        })),
      });
    if (args.values.length)
      await db.taskFieldValue.createMany({
        data: args.values.map((item) => ({
          taskId: task.id,
          fieldDefinitionId: item.definitionId,
          workspaceId: args.workspaceId,
          value: item.value,
        })),
      });
    return (await this.get(task.id, db))!;
  }

  /** Replaces a task’s assignees and answers and increments its version. */
  async update(
    task: StoredTask,
    args: {
      listId: string;
      title: string;
      description: string | null;
      statusKey: string;
      priority: Priority;
      dueDate: Date | null;
      assigneeIds: string[];
      values: Array<{ definitionId: string; value: Prisma.InputJsonValue }>;
      position?: number;
    },
    db: DomainDb,
  ) {
    await db.task.update({
      where: { id: task.id },
      data: {
        primaryListId: args.listId,
        title: args.title,
        description: args.description,
        statusKey: args.statusKey,
        priority: args.priority,
        dueDate: args.dueDate,
        position: args.position ?? task.position,
        version: { increment: 1 },
      },
    });
    await db.taskAssignee.deleteMany({ where: { taskId: task.id } });
    if (args.assigneeIds.length)
      await db.taskAssignee.createMany({
        data: args.assigneeIds.map((userId) => ({
          taskId: task.id,
          userId,
          workspaceId: task.workspaceId,
        })),
      });
    await db.taskFieldValue.deleteMany({ where: { taskId: task.id } });
    if (args.values.length)
      await db.taskFieldValue.createMany({
        data: args.values.map((item) => ({
          taskId: task.id,
          fieldDefinitionId: item.definitionId,
          workspaceId: task.workspaceId,
          value: item.value,
        })),
      });
    return (await this.get(task.id, db))!;
  }

  /** Places a task in a column and compacts both affected columns. Returns null for an invalid anchor. */
  async place(
    task: StoredTask,
    listId: string,
    statusKey: string,
    beforeTaskId: string | undefined,
    db: DomainDb,
  ) {
    const target = await db.task.findMany({
      where: { primaryListId: listId, statusKey, archivedAt: null, id: { not: task.id } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    const index = beforeTaskId
      ? target.findIndex((item) => item.id === beforeTaskId)
      : target.length;
    if (index < 0) return null;
    target.splice(index, 0, task);
    for (let i = 0; i < target.length; i++) {
      const peer = target[i];
      if (peer.id !== task.id && peer.position.toNumber() !== i + 1)
        await db.task.update({
          where: { id: peer.id },
          data: { position: i + 1, version: { increment: 1 } },
        });
    }
    if (task.primaryListId !== listId || task.statusKey !== statusKey) {
      const source = await db.task.findMany({
        where: {
          primaryListId: task.primaryListId,
          statusKey: task.statusKey,
          archivedAt: null,
          id: { not: task.id },
        },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      for (let i = 0; i < source.length; i++) {
        const peer = source[i];
        if (peer.position.toNumber() !== i + 1)
          await db.task.update({
            where: { id: peer.id },
            data: { position: i + 1, version: { increment: 1 } },
          });
      }
    }
    return index + 1;
  }

  /** Soft-archives a task and closes gaps in its former column. */
  async archive(task: StoredTask, db: DomainDb) {
    await db.task.update({
      where: { id: task.id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    const remaining = await db.task.findMany({
      where: { primaryListId: task.primaryListId, statusKey: task.statusKey, archivedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    for (let i = 0; i < remaining.length; i++) {
      const peer = remaining[i];
      if (peer.position.toNumber() !== i + 1)
        await db.task.update({
          where: { id: peer.id },
          data: { position: i + 1, version: { increment: 1 } },
        });
    }
  }
}
