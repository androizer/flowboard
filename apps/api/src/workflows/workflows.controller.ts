import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessGuard, CurrentActor } from '../identity/access.guard';
import { DomainActor } from '../permissions/permissions.service';
import { WorkflowsService } from './workflows.service';

@Controller('v1')
@UseGuards(AccessGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get('workspaces/:id')
  workspace(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.workspace(actor, id);
  }

  @Patch('workspaces/:id')
  renameWorkspace(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.renameWorkspace(actor, id, body);
  }

  @Get('containers')
  containers(
    @CurrentActor() actor: DomainActor,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.workflows.containers(
      actor,
      offset === undefined ? 0 : Number(offset),
      limit === undefined ? 50 : Number(limit),
    );
  }

  @Post('containers')
  createContainer(@CurrentActor() actor: DomainActor, @Body() body: unknown) {
    return this.workflows.createContainer(actor, body);
  }

  @Post('containers/reorder')
  @HttpCode(200)
  reorderContainers(
    @CurrentActor() actor: DomainActor,
    @Body() body: unknown,
  ) {
    return this.workflows.reorderContainers(actor, body);
  }

  @Get('containers/:id')
  container(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.container(actor, id);
  }

  @Patch('containers/:id')
  updateContainer(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.updateContainer(actor, id, body);
  }

  @Delete('containers/:id')
  @HttpCode(204)
  archiveContainer(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.archiveContainer(actor, id);
  }

  @Get('containers/:id/status-set')
  containerStatusSet(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.statusSet(actor, id);
  }

  @Put('containers/:id/status-set')
  putContainerStatusSet(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.putStatusSet(actor, id, body);
  }

  @Delete('containers/:id/status-set')
  @HttpCode(204)
  resetContainerStatusSet(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.resetStatusSet(actor, id);
  }

  @Get('workspaces/:id/status-set')
  workspaceStatusSet(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (id !== actor.workspaceId) throw new NotFoundException('Workspace is unavailable.');
    return this.workflows.statusSet(actor, null);
  }

  @Put('workspaces/:id/status-set')
  putWorkspaceStatusSet(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    if (id !== actor.workspaceId) throw new NotFoundException('Workspace is unavailable.');
    return this.workflows.putStatusSet(actor, null, body);
  }

  @Get('containers/:id/fields')
  localFields(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.workflows.localFields(
      actor,
      id,
      offset === undefined ? 0 : Number(offset),
      limit === undefined ? 50 : Number(limit),
    );
  }

  @Post('containers/:id/fields')
  createField(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.createField(actor, id, body);
  }

  @Post('containers/:id/fields/reorder')
  @HttpCode(200)
  reorderFields(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.reorderFields(actor, id, body);
  }

  @Patch('fields/:id')
  updateField(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.updateField(actor, id, body);
  }

  @Delete('fields/:id')
  @HttpCode(204)
  deleteField(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.deleteField(actor, id);
  }

  @Get('containers/:id/grants')
  grants(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.grants(actor, id);
  }

  @Put('containers/:id/grants/:userId')
  putGrant(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    return this.workflows.putGrant(actor, id, userId, body);
  }

  @Delete('containers/:id/grants/:userId')
  @HttpCode(204)
  deleteGrant(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.workflows.deleteGrant(actor, id, userId);
  }

  @Get('tree')
  tree(@CurrentActor() actor: DomainActor) {
    return this.workflows.tree(actor);
  }

  @Get('workspaces/:id/overview')
  overview(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.overview(actor, id);
  }

  @Get('lists/:id/board')
  board(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.workflows.board(
      actor,
      id,
      offset === undefined ? 0 : Number(offset),
      limit === undefined ? 50 : Number(limit),
    );
  }

  @Get('lists/:id/tasks')
  async tasks(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const { items, page } = await this.workflows.board(
      actor,
      id,
      offset === undefined ? 0 : Number(offset),
      limit === undefined ? 50 : Number(limit),
    );
    return { items, page };
  }

  @Get('lists/:id/resolved-statuses')
  async statuses(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    const { statuses, statusSource } = await this.workflows.board(actor, id);
    return { statuses, source: statusSource };
  }

  @Get('lists/:id/resolved-fields')
  async fields(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    const { fields } = await this.workflows.board(actor, id);
    return { fields };
  }

  @Get('tasks/:id')
  detail(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.detail(actor, id);
  }

  @Post('lists/:id/tasks')
  create(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.create(actor, id, body);
  }

  @Patch('tasks/:id')
  update(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.update(actor, id, body);
  }

  @Post('tasks/:id/placement')
  @HttpCode(200)
  placement(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.placement(actor, id, body);
  }

  @Post('tasks/:id/move')
  @HttpCode(200)
  move(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.move(actor, id, body);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  archive(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    if (!expectedVersion || !Number.isInteger(Number(expectedVersion)))
      throw new BadRequestException('expectedVersion is required.');
    return this.workflows.archive(actor, id, Number(expectedVersion));
  }
}
