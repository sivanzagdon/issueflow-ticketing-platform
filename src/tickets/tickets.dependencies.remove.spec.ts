import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import {
  AUDIT_ENTITY_TICKET_DEPENDENCY,
  createMockDependencyRepository,
  mockDependencyEntity,
  TicketDependencyEntityStub,
  TicketsServiceSlice12,
} from './testing/dependency.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 12 — remove ticket dependency (blocker).
 */
describe('TicketsService removeDependency (Slice 12)', () => {
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

  it('removes an existing dependency', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.findOne.mockResolvedValue(
      mockDependencyEntity({ id: 7, ticketId: 10, blockerTicketId: 42 }),
    );
    dependencyRepository.delete.mockResolvedValue({
      affected: 1,
      raw: [],
      generatedMaps: [],
    });

    await service.removeDependency(10, 42, 2);

    expect(dependencyRepository.delete).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 10 }),
    );
  });

  it('runs dependency removal inside dataSource.transaction', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.findOne.mockResolvedValue(
      mockDependencyEntity({ id: 7, ticketId: 10, blockerTicketId: 42 }),
    );

    await service.removeDependency(10, 42, 2);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('writes DELETE audit for TICKET_DEPENDENCY inside the same transaction', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.findOne.mockResolvedValue(
      mockDependencyEntity({ id: 7, ticketId: 10, blockerTicketId: 42 }),
    );

    await service.removeDependency(10, 42, 2);

    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AuditAction.DELETE,
      entityType: AUDIT_ENTITY_TICKET_DEPENDENCY,
      entityId: 7,
      performedBy: 2,
      actorType: AuditActor.USER,
      details: expect.objectContaining({
        ticketId: 10,
        blockedBy: 42,
      }),
    });
    expect(auditLogService.record).toHaveBeenCalledTimes(1);
  });

  it('fails with NotFoundException when dependency does not exist', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.findOne.mockResolvedValue(null);

    await expect(service.removeDependency(10, 42, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dependencyRepository.delete).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('does not remove unrelated dependencies', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.findOne.mockResolvedValue(
      mockDependencyEntity({ id: 7, ticketId: 10, blockerTicketId: 42 }),
    );

    await service.removeDependency(10, 42, 2);

    expect(dependencyRepository.delete).toHaveBeenCalledTimes(1);
    expect(dependencyRepository.delete).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 10 }),
    );
  });

  it('rolls back delete when audit write fails', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.findOne.mockResolvedValue(
      mockDependencyEntity({ id: 7, ticketId: 10, blockerTicketId: 42 }),
    );
    auditLogService.record.mockRejectedValue(new Error('audit delete failed'));

    await expect(service.removeDependency(10, 42, 2)).rejects.toThrow(
      'audit delete failed',
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not write audit when dependency is missing', async () => {
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ id: 10, deletedAt: null }),
    );
    dependencyRepository.findOne.mockResolvedValue(null);

    await expect(service.removeDependency(10, 42, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
