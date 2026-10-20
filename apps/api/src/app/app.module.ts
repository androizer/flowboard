import { Module } from '@nestjs/common';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { IdentityModule } from '../identity/identity.module';

/**
 * API composition root. Domain modules register their own controllers and
 * providers; cross-domain work will be composed in the workflows module.
 */
@Module({
  imports: [IdentityModule, HierarchyModule],
})
export class AppModule {}
