import { ForbiddenException, Injectable } from '@nestjs/common';
import { Container, ContainerGrant } from '@prisma/client';
import { HierarchyService, DomainDb } from '../hierarchy/hierarchy.service';
import { PrismaService } from '../persistence/prisma.service';

export type DomainActor = { userId: string; workspaceId: string; role: 'admin' | 'member' };

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: HierarchyService,
  ) {}

  private allowed(path: Container[], grants: ContainerGrant[], actor: DomainActor) {
    if (actor.role === 'admin') return true;
    let inheritedAllow = false;
    for (const node of path) {
      const grant = grants.find((item) => item.containerId === node.id);
      if (grant?.mode === 'deny') return false;
      if (grant?.mode === 'allow') inheritedAllow = true;
      if (node.visibility === 'private' && !inheritedAllow) return false;
    }
    return true;
  }

  async assertPath(actor: DomainActor, path: Container[], db: DomainDb = this.prisma) {
    const grants =
      actor.role === 'admin'
        ? []
        : await db.containerGrant.findMany({
            where: {
              workspaceId: actor.workspaceId,
              userId: actor.userId,
              containerId: { in: path.map((node) => node.id) },
            },
          });
    if (!this.allowed(path, grants, actor))
      throw new ForbiddenException('Resource is not accessible.');
  }

  async assertList(actor: DomainActor, listId: string, db: DomainDb = this.prisma) {
    const path = await this.hierarchy.listPath(actor.workspaceId, listId, db);
    await this.assertPath(actor, path, db);
    return path;
  }

  async filteredTree(actor: DomainActor, db: DomainDb = this.prisma) {
    const nodes = await this.hierarchy.activeTree(actor.workspaceId, db);
    if (actor.role === 'admin') return nodes;
    const grants = await db.containerGrant.findMany({
      where: { workspaceId: actor.workspaceId, userId: actor.userId },
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const visible = new Set<string>();
    for (const node of nodes) {
      const path: Container[] = [];
      let current: Container | undefined = node;
      while (current) {
        path.unshift(current);
        current = current.parentContainerId ? byId.get(current.parentContainerId) : undefined;
      }
      if (path[0]?.type === 'space' && this.allowed(path, grants, actor)) visible.add(node.id);
    }
    return nodes.filter((node) => visible.has(node.id));
  }
}
