import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { WorkflowsModule } from '../workflows/workflows.module';

/**
 * API composition root. Domain modules register their own controllers and
 * providers; cross-domain work will be composed in the workflows module.
 */
@Module({
  imports: [IdentityModule, WorkflowsModule],
})
export class AppModule {}
