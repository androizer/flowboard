import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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

  @Get('tree') tree(@CurrentActor() actor: DomainActor) {
    return this.workflows.tree(actor);
  }

  @Get('workspaces/:id/overview') overview(
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
  async statuses(@CurrentActor() actor: DomainActor, @Param('id', ParseUUIDPipe) id: string) {
    const { statuses, statusSource } = await this.workflows.board(actor, id);
    return { statuses, source: statusSource };
  }

  @Get('lists/:id/resolved-fields')
  async fields(@CurrentActor() actor: DomainActor, @Param('id', ParseUUIDPipe) id: string) {
    const { fields } = await this.workflows.board(actor, id);
    return { fields };
  }

  @Get('tasks/:id') detail(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.detail(actor, id);
  }

  @Post('lists/:id/tasks') create(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.create(actor, id, body);
  }

  @Patch('tasks/:id') update(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.update(actor, id, body);
  }

  @Post('tasks/:id/placement') @HttpCode(200) placement(
    @CurrentActor() actor: DomainActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.placement(actor, id, body);
  }

  @Post('tasks/:id/move') @HttpCode(200) move(
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
