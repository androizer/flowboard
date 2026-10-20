import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { HierarchyController } from './hierarchy.controller';

@Module({
  imports: [IdentityModule, PersistenceModule],
  controllers: [HierarchyController],
})
export class HierarchyModule {}
