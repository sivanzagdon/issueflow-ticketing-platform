import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { mockDataSourceWithRepositories } from '../../audit-log/testing/transaction-test.helpers';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { ProjectsService } from '../../projects/projects.service';
import { UsersService } from '../../users/users.service';
import { Ticket } from '../entities/ticket.entity';
import { TicketsService } from '../tickets.service';
import { ticketAttachmentRepositoryProvider } from './attachment.fixtures';
import {
  createMockDependencyRepository,
  ticketDependencyRepositoryProvider,
} from './dependency.fixtures';
import { TicketDependency } from '../entities/ticket-dependency.entity';

export type EscalationTestContext = {
  module: TestingModule;
  service: TicketsService;
  ticketRepository: jest.Mocked<Repository<Ticket>>;
  auditLogService: jest.Mocked<Pick<AuditLogService, 'record' | 'buildTicketStateHistory'>>;
  dataSource: { transaction: jest.Mock };
};

export async function createEscalationTestModule(): Promise<EscalationTestContext> {
  const ticketRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as jest.Mocked<Repository<Ticket>>;

  const dependencyRepository = createMockDependencyRepository();
  const auditLogService = {
    record: jest.fn().mockResolvedValue({ id: 1 }),
    buildTicketStateHistory: jest.fn().mockResolvedValue([]),
  };

  const module = await Test.createTestingModule({
    providers: [
      TicketsService,
      { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
      ticketDependencyRepositoryProvider(),
      ticketAttachmentRepositoryProvider(),
      {
        provide: ProjectsService,
        useValue: {
          findOne: jest.fn(),
          getProjectWorkload: jest.fn().mockResolvedValue([]),
        },
      },
      { provide: UsersService, useValue: { findOne: jest.fn() } },
      { provide: AuditLogService, useValue: auditLogService },
      {
        provide: DataSource,
        useValue: mockDataSourceWithRepositories(
          new Map<unknown, object>([
            [Ticket, ticketRepository],
            [TicketDependency, dependencyRepository],
          ]),
        ),
      },
    ],
  }).compile();

  return {
    module,
    service: module.get(TicketsService),
    ticketRepository,
    auditLogService,
    dataSource: module.get(DataSource) as { transaction: jest.Mock },
  };
}
