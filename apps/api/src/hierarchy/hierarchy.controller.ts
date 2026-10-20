import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccessGuard, CurrentActor } from '../identity/access.guard';
import { PrismaService } from '../persistence/prisma.service';

@Controller('v1')
export class HierarchyController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(AccessGuard) @Get('tree')
  async tree(@CurrentActor() actor: { workspaceId: string }) {
    const containers = await this.prisma.container.findMany({ where: { workspaceId: actor.workspaceId, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
    return { workspaceId: actor.workspaceId, items: containers };
  }
}
