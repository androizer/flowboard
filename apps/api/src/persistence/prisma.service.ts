import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Shares one managed database client with backend services. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Opens the database connection when the API module starts. */
  async onModuleInit() {
    await this.$connect();
  }
  /** Closes the database connection when the API module stops. */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
