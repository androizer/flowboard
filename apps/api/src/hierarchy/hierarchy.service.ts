import { Injectable, NotFoundException } from '@nestjs/common';
import { Container, Prisma } from '@prisma/client';
import { PrismaService } from '../persistence/prisma.service';

export type DomainDb = Prisma.TransactionClient;

@Injectable()
export class HierarchyService {
  constructor(private readonly prisma: PrismaService) {}

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

  async listPath(workspaceId: string, listId: string, db: DomainDb = this.prisma) {
    const path = await this.path(workspaceId, listId, db);
    if (path.at(-1)?.type !== 'list' || path.length !== 3 || path[1].type !== 'folder')
      throw new NotFoundException('List is unavailable.');
    return path;
  }
}
