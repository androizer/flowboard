import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [PersistenceModule],
  controllers: [AuthController],
  providers: [AuthService, AccessGuard],
  exports: [AuthService, AccessGuard],
})
export class IdentityModule {}
