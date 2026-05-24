import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { TicketDependency } from './entities/ticket-dependency.entity';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketAttachmentRepositoryProvider } from './testing/attachment.fixtures';
import {
  createMockDependencyRepository,
  ticketDependencyRepositoryProvider,
} from './testing/dependency.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 12 — DONE transition blocked by unresolved ticket dependencies.
 */
describe('TicketsService update — unresolved blockers (Slice 12)', () => {
  let service: TicketsService;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne' | 'save'>>;
  let dependencyRepository: ReturnType<typeof createMockDependencyRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: ReturnType<
    typeof createMockTransactionalContext
  >['manager'];

  beforeEach(async () => {
    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    ticketRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<Ticket>, 'findOne' | 'save'>>;

    dependencyRepository = createMockDependencyRepository();

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepository;
      }
      if (entity === TicketDependency) {
        return dependencyRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        ticketAttachmentRepositoryProvider(),
        {
          provide: ProjectsService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockProjectResponse()) },
        },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  it('rejects transition to DONE when ticket has unresolved blockers', async () => {
    const existing = mockTicketEntity({ id: 10, status: TicketStatus.IN_REVIEW });
    ticketRepository.findOne.mockResolvedValue(existing);
    dependencyRepository.count.mockResolvedValue(1);

    await expect(
      service.update(10, { version: 1, status: TicketStatus.DONE }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(dependencyRepository.count).toHaveBeenCalledWith({
      where: {
        ticketId: 10,
        blocker: {
          deletedAt: IsNull(),
          status: Not(TicketStatus.DONE),
        },
      },
    });
    expect(ticketRepository.save).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('allows transition to DONE when all blockers are DONE', async () => {
    const existing = mockTicketEntity({ id: 10, status: TicketStatus.IN_REVIEW });
    const updated = mockTicketEntity({ id: 10, status: TicketStatus.DONE });
    ticketRepository.findOne.mockResolvedValue(existing);
    dependencyRepository.count.mockResolvedValue(0);
    ticketRepository.save.mockResolvedValue(updated);

    const result = await service.update(10, { version: 1, status: TicketStatus.DONE });

    expect(result.status).toBe(TicketStatus.DONE);
    expect(ticketRepository.save).toHaveBeenCalled();
    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.TICKET,
      entityId: 10,
    });
  });

  it('allows transition to DONE when only soft-deleted blockers remain', async () => {
    const existing = mockTicketEntity({ id: 10, status: TicketStatus.IN_REVIEW });
    const updated = mockTicketEntity({ id: 10, status: TicketStatus.DONE });
    ticketRepository.findOne.mockResolvedValue(existing);
    dependencyRepository.count.mockResolvedValue(0);
    ticketRepository.save.mockResolvedValue(updated);

    await service.update(10, { version: 1, status: TicketStatus.DONE });

    expect(dependencyRepository.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          blocker: expect.objectContaining({ deletedAt: IsNull() }),
        }),
      }),
    );
  });

  it('does not check blockers when status is not changing to DONE', async () => {
    const existing = mockTicketEntity({ status: TicketStatus.IN_PROGRESS });
    const updated = mockTicketEntity({ status: TicketStatus.IN_REVIEW });
    ticketRepository.findOne.mockResolvedValue(existing);
    ticketRepository.save.mockResolvedValue(updated);

    await service.update(1, { version: 1, status: TicketStatus.IN_REVIEW });

    expect(dependencyRepository.count).not.toHaveBeenCalled();
  });
});
