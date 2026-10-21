import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Container, ContainerType, Prisma, Visibility } from '@prisma/client';
import { PrismaService } from '../persistence/prisma.service';

export type DomainDb = Prisma.TransactionClient;

/** Owns workspace containers and their space → folder → list paths. */
@Injectable()
export class HierarchyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns live containers whose full parent chain is also live. */
  async activeTree(workspaceId: string, db: DomainDb = this.prisma) {
    const nodes = await db.container.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return nodes.filter((node) => {
      let current = node;
      while (current.parentContainerId) {
        const parent = byId.get(current.parentContainerId);
        if (!parent) return false;
        current = parent;
      }
      return current.type === 'space';
    });
  }

  /** Builds a live path from space to container; rejects missing or archived branches. */
  async path(
    workspaceId: string,
    containerId: string,
    db: DomainDb = this.prisma,
  ): Promise<Container[]> {
    const nodes = await db.container.findMany({ where: { workspaceId } });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const path: Container[] = [];
    let current = byId.get(containerId);
    while (current) {
      if (current.archivedAt) throw new NotFoundException('Container is unavailable.');
      path.unshift(current);
      current = current.parentContainerId ? byId.get(current.parentContainerId) : undefined;
    }
    if (!path.length || path[0].type !== 'space' || path.at(-1)?.id !== containerId)
      throw new NotFoundException('Container is unavailable.');
    return path;
  }

  /** Requires a complete space → folder → list path for list operations. */
  async listPath(workspaceId: string, listId: string, db: DomainDb = this.prisma) {
    const path = await this.path(workspaceId, listId, db);
    if (path.at(-1)?.type !== 'list' || path.length !== 3 || path[1].type !== 'folder')
      throw new NotFoundException('List is unavailable.');
    return path;
  }

  /** Loads a workspace or reports that it is unavailable. */
  async workspace(id: string, db: DomainDb = this.prisma) {
    const row = await db.workspace.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Workspace is unavailable.');
    return row;
  }

  /** Changes the workspace name through the caller’s transaction. */
  async renameWorkspace(id: string, name: string, db: DomainDb) {
    return db.workspace.update({ where: { id }, data: { name } });
  }

  /** Appends a container after its live siblings and records its parent type. */
  async create(
    workspaceId: string,
    parent: Container | null,
    type: ContainerType,
    name: string,
    visibility: Visibility,
    createdByUserId: string,
    db: DomainDb,
  ) {
    const siblings = await db.container.findMany({
      where: { workspaceId, parentContainerId: parent?.id ?? null, archivedAt: null },
      orderBy: { position: 'desc' },
      take: 1,
    });
    return db.container.create({
      data: {
        workspaceId,
        parentContainerId: parent?.id ?? null,
        parentType: parent?.type ?? null,
        type,
        name,
        visibility,
        createdByUserId,
        position: (siblings[0]?.position.toNumber() ?? 0) + 1,
      },
    });
  }

  /** Saves validated container changes through the caller’s transaction. */
  async update(
    id: string,
    data: { name?: string; visibility?: Visibility; archivedAt?: Date },
    db: DomainDb,
  ) {
    return db.container.update({ where: { id }, data });
  }

  /** Repositions siblings only when every live sibling is supplied exactly once. */
  async reorder(workspaceId: string, parentId: string | null, ids: string[], db: DomainDb) {
    const siblings = await db.container.findMany({
      where: { workspaceId, parentContainerId: parentId, archivedAt: null },
    });
    if (
      siblings.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      siblings.some((row) => !ids.includes(row.id))
    )
      throw new BadRequestException('Supply every active sibling exactly once.');
    for (let index = 0; index < ids.length; index++)
      await db.container.update({ where: { id: ids[index] }, data: { position: index + 1 } });
  }

  /** Finds all list paths, including archived branches, for configuration safety checks. */
  async retainedListPaths(workspaceId: string, db: DomainDb) {
    const nodes = await db.container.findMany({ where: { workspaceId } });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return nodes
      .filter((node) => node.type === 'list')
      .map((node) => {
        const path: Container[] = [];
        let current: Container | undefined = node;
        while (current) {
          path.unshift(current);
          current = current.parentContainerId ? byId.get(current.parentContainerId) : undefined;
        }
        return path;
      });
  }
}
