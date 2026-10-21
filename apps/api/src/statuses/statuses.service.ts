import { BadRequestException, Injectable } from '@nestjs/common';
import { Container, StatusCategory } from '@prisma/client';
import { DomainDb } from '../hierarchy/hierarchy.service';
import { PrismaService } from '../persistence/prisma.service';

@Injectable()
export class StatusesService {
  constructor(private readonly prisma: PrismaService) {}

  async local(workspaceId: string, ownerContainerId: string | null, db: DomainDb = this.prisma) {
    return db.statusSet.findFirst({
      where: { workspaceId, ownerContainerId },
      include: { statuses: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
  }

  candidate(value: unknown) {
    if (!Array.isArray(value) || value.length < 3)
      throw new BadRequestException('statuses must be a complete array.');
    const rows = value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw new BadRequestException(`statuses.${index}: invalid definition.`);
      const row = item as Record<string, unknown>;
      if (
        Object.keys(row).some((key) => !['key', 'name', 'category', 'color'].includes(key)) ||
        typeof row.key !== 'string' ||
        !/^[a-z][a-z0-9_]*$/.test(row.key) ||
        typeof row.name !== 'string' ||
        !row.name.trim() ||
        typeof row.color !== 'string' ||
        !row.color.trim() ||
        !Object.values(StatusCategory).includes(row.category as StatusCategory)
      )
        throw new BadRequestException(`statuses.${index}: invalid definition.`);
      return {
        key: row.key,
        name: row.name.trim(),
        category: row.category as StatusCategory,
        color: row.color,
        position: index + 1,
      };
    });
    if (new Set(rows.map((row) => row.key)).size !== rows.length)
      throw new BadRequestException('Status keys must be unique.');
    for (const category of [StatusCategory.not_started, StatusCategory.active, StatusCategory.done])
      if (!rows.some((row) => row.category === category))
        throw new BadRequestException(`Status category ${category} is required.`);
    return rows;
  }

  async put(
    workspaceId: string,
    ownerContainerId: string | null,
    rows: ReturnType<StatusesService['candidate']>,
    db: DomainDb,
  ) {
    let set = await this.local(workspaceId, ownerContainerId, db);
    if (!set)
      set = await db.statusSet.create({
        data: { workspaceId, ownerContainerId },
        include: { statuses: true },
      });
    const keys = rows.map((row) => row.key);
    await db.status.deleteMany({ where: { statusSetId: set.id, key: { notIn: keys } } });
    for (const row of rows) {
      await db.status.upsert({
        where: { statusSetId_key: { statusSetId: set.id, key: row.key } },
        create: { statusSetId: set.id, ...row },
        update: {
          name: row.name,
          category: row.category,
          color: row.color,
          position: row.position,
        },
      });
    }
    return this.local(workspaceId, ownerContainerId, db);
  }

  async reset(workspaceId: string, ownerContainerId: string, db: DomainDb) {
    const set = await this.local(workspaceId, ownerContainerId, db);
    if (set) await db.statusSet.delete({ where: { id: set.id } });
  }

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
