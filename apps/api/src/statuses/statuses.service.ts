import { BadRequestException, Injectable } from '@nestjs/common';
import { Container } from '@prisma/client';
import { DomainDb } from '../hierarchy/hierarchy.service';
import { PrismaService } from '../persistence/prisma.service';

@Injectable()
export class StatusesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(workspaceId: string, path: Container[], db: DomainDb = this.prisma) {
    const ids = path.map((node) => node.id);
    const sets = await db.statusSet.findMany({
      where: { workspaceId, OR: [{ ownerContainerId: null }, { ownerContainerId: { in: ids } }] },
      include: { statuses: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
    const set =
      [...path]
        .reverse()
        .map((node) => sets.find((item) => item.ownerContainerId === node.id))
        .find(Boolean) ?? sets.find((item) => item.ownerContainerId === null);
    if (!set) throw new BadRequestException('No effective status set exists.');
    return {
      statuses: set.statuses.map((status) => ({
        id: status.id,
        key: status.key,
        name: status.name,
        category: status.category,
        color: status.color,
        position: status.position.toNumber(),
      })),
      statusSource: set.ownerContainerId
        ? {
            type: path.find((node) => node.id === set.ownerContainerId)?.type,
            id: set.ownerContainerId,
          }
        : { type: 'workspace', id: workspaceId },
    };
  }

  validate(statusKey: unknown, statuses: Array<{ key: string }>) {
    if (typeof statusKey !== 'string' || !statuses.some((status) => status.key === statusKey))
      throw new BadRequestException('Status is not valid for this list.');
    return statusKey;
  }
}
