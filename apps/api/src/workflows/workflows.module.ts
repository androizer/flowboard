import { Module } from '@nestjs/common';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { HierarchyService } from '../hierarchy/hierarchy.service';
import { IdentityModule } from '../identity/identity.module';
import { PermissionsService } from '../permissions/permissions.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { TasksService } from '../tasks/tasks.service';
import { StatusesService } from '../statuses/statuses.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [IdentityModule, PersistenceModule],
  controllers: [WorkflowsController],
  providers: [
    HierarchyService,
    PermissionsService,
    StatusesService,
    CustomFieldsService,
    TasksService,
    WorkflowsService,
  ],
})
export class WorkflowsModule {}
