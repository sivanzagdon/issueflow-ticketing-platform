import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { Ticket } from './entities/ticket.entity';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket]),
    AuthModule,
    ProjectsModule,
    UsersModule,
    AuditLogModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TypeOrmModule, TicketsService],
})
export class TicketsModule {}
