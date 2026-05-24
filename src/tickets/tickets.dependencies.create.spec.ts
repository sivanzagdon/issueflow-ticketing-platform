import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketAttachmentRepositoryProvider } from './testing/attachment.fixtures';
import {
  AUDIT_ENTITY_TICKET_DEPENDENCY,
  createMockDependencyRepository,
  mockDependencyEntity,
  TicketDependencyEntityStub,
  TicketsServiceSlice12,
} from './testing/dependency.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 12 — add ticket dependency (blocker) domain rules.
 */
describe('TicketsService addDependency (Slice 12)', () => {
  let service: TicketsServiceSlice12;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let dependencyRepository: ReturnType<typeof createMockDependencyRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: ReturnType<
    typeof createMockTransactionalContext
  >['manager'];

  beforeEach(async () => {
    ticketRepository = { findOne: jest.fn() };
    dependencyRepository = createMockDependencyRepository();
    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepository;
      }
      if (entity === TicketDependencyEntityStub) {
        return dependencyRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        {
          provide: getRepositoryToken(TicketDependencyEntityStub),
          useValue: dependencyRepository,
        },
        ticketAttachmentRepositoryProvider(),
        {
          provide: ProjectsService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockProjectResponse()) },
        },
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
        },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TicketsService) as TicketsServiceSlice12;
  });

  const activeTicket = (id: number) =>
    mockTicketEntity({ id, deletedAt: null });

  it('creates a dependency between two valid active tickets', async () => {
    ticketRepository.findOne
      .mockResolvedValueOnce(activeTicket(10))
      .mockResolvedValueOnce(activeTicket(42));
    dependencyRepository.save.mockResolvedValue(
      mockDependencyEntity({ ticketId: 10, blockerTicketId: 42 }),
    );

    await service.addDependency(10, 42, 2);

    expect(dependencyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 10 }),
    );
    expect(dependencyRepository.save).toHaveBeenCalled();
  });

  it('runs dependency creation inside dataSource.transaction', async () => {
    ticketRepository.findOne
      .mockResolvedValueOnce(activeTicket(10))
      .mockResolvedValueOnce(activeTicket(42));
    dependencyRepository.save.mockResolvedValue(
      mockDependencyEntity({ ticketId: 10, blockerTicketId: 42 }),
    );

    await service.addDependency(10, 42, 2);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('writes CREATE audit for TICKET_DEPENDENCY inside the same transaction', async () => {
    ticketRepository.findOne
      .mockResolvedValueOnce(activeTicket(10))
      .mockResolvedValueOnce(activeTicket(42));
    dependencyRepository.save.mockResolvedValue(
      mockDependencyEntity({ id: 99, ticketId: 10, blockerTicketId: 42 }),
    );

    await service.addDependency(10, 42, 2);

    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AuditAction.CREATE,
      entityType: AUDIT_ENTITY_TICKET_DEPENDENCY,
      entityId: 99,
      performedBy: 2,
      actorType: AuditActor.USER,
      details: expect.objectContaining({
        ticketId: 10,
        blockedBy: 42,
      }),
    });
    expect(auditLogService.record).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate dependency with ConflictException', async () => {
    ticketRepository.findOne
      .mockResolvedValueOnce(activeTicket(10))
      .mockResolvedValueOnce(activeTicket(42));
    dependencyRepository.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        constraint: 'ticket_dependencies_ticket_blocker_key',
      } as never),
    );

    await expect(service.addDependency(10, 42, 2)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects ticket depending on itself with BadRequestException', async () => {
    ticketRepository.findOne.mockResolvedValue(activeTicket(10));

    await expect(service.addDependency(10, 10, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dependencyRepository.save).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('fails with NotFoundException when source ticket is missing', async () => {
    ticketRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.addDependency(99, 42, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dependencyRepository.save).not.toHaveBeenCalled();
  });

  it('fails with NotFoundException when blocker ticket is missing', async () => {
    ticketRepository.findOne
      .mockResolvedValueOnce(activeTicket(10))
      .mockResolvedValueOnce(null);

    await expect(service.addDependency(10, 99, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dependencyRepository.save).not.toHaveBeenCalled();
  });

  it('rejects when source ticket is soft-deleted', async () => {
    ticketRepository.findOne.mockResolvedValueOnce(
      mockTicketEntity({ id: 10, deletedAt: new Date() }),
    );

    await expect(service.addDependency(10, 42, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dependencyRepository.save).not.toHaveBeenCalled();
  });

  it('rejects when blocker ticket is soft-deleted', async () => {
    ticketRepository.findOne
      .mockResolvedValueOnce(activeTicket(10))
      .mockResolvedValueOnce(
        mockTicketEntity({ id: 42, deletedAt: new Date() }),
      );

    await expect(service.addDependency(10, 42, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dependencyRepository.save).not.toHaveBeenCalled();
  });

  it('rolls back dependency creation when audit write fails', async () => {
    ticketRepository.findOne
      .mockResolvedValueOnce(activeTicket(10))
      .mockResolvedValueOnce(activeTicket(42));
    dependencyRepository.save.mockResolvedValue(
      mockDependencyEntity({ ticketId: 10, blockerTicketId: 42 }),
    );
    auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

    await expect(service.addDependency(10, 42, 2)).rejects.toThrow(
      'audit insert failed',
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not write audit when validation fails before mutation', async () => {
    ticketRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.addDependency(99, 42, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
