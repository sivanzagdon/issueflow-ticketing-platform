import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { ProjectsService } from '../projects/projects.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { UsersService } from '../users/users.service';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketAttachmentRepositoryProvider } from './testing/attachment.fixtures';
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Regression: ticket restore must run lookup, mutation, post-restore fetch,
 * and RESTORE audit entirely inside one dataSource.transaction.
 */
describe('TicketsService restore transaction boundary (regression)', () => {
  let service: TicketsService;
  let ticketRepository: jest.Mocked<
    Pick<Repository<Ticket>, 'findOne' | 'restore'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record' | 'buildTicketStateHistory'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  beforeEach(async () => {
    ticketRepository = {
      findOne: jest.fn(),
      restore: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<Ticket>, 'findOne' | 'restore'>>;

    auditLogService = {
      record: jest.fn().mockResolvedValue({ id: 1 }),
      buildTicketStateHistory: jest.fn().mockResolvedValue([]),
    };

    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;
    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const module = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
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

    service = module.get(TicketsService);
  });

  describe('restore', () => {
    it('runs lookup, restore, and audit inside dataSource.transaction', async () => {
      const restored = mockTicketEntity({ id: 7, deletedAt: null });
      ticketRepository.findOne
        .mockResolvedValueOnce(mockTicketEntity({ id: 7, deletedAt: new Date() }))
        .mockResolvedValueOnce(restored);
      ticketRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      const result = await service.restore(7, 2);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(ticketRepository.restore).toHaveBeenCalledTimes(1);
      expect(auditLogService.record).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.RESTORE,
        entityType: AuditEntityType.TICKET,
        entityId: 7,
        performedBy: 2,
        actorType: AuditActor.USER,
        details: {
          before: { deletedAt: expect.any(String) },
          after: { deletedAt: null },
        },
      });
      expect(result).toMatchObject({ id: 7 });
    });

    it('loads soft-deleted ticket via manager.getRepository(Ticket) with withDeleted inside transaction', async () => {
      const deleted = mockTicketEntity({ id: 7, deletedAt: new Date() });
      const restored = mockTicketEntity({ id: 7, deletedAt: null });
      const transactionalRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(deleted)
          .mockResolvedValueOnce(restored),
        restore: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
      };

      transactionalManager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Ticket) {
          return transactionalRepo;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as unknown as typeof transactionalManager.getRepository;

      ticketRepository.findOne.mockImplementation(() => {
        throw new Error('injected repository must not be used for restore lookup');
      });

      await service.restore(7, 2);

      expect(transactionalManager.getRepository).toHaveBeenCalledWith(Ticket);
      expect(transactionalRepo.findOne).toHaveBeenNthCalledWith(1, {
        where: { id: 7 },
        withDeleted: true,
      });
      expect(transactionalRepo.restore).toHaveBeenCalledWith({ id: 7 });
    });

    it('starts transaction before restore lookup', async () => {
      const restored = mockTicketEntity({ id: 7, deletedAt: null });
      const callOrder: string[] = [];
      let findOneCalls = 0;

      dataSource.transaction.mockImplementation(async (work) => {
        callOrder.push('transaction');
        return work(transactionalManager);
      });
      ticketRepository.findOne.mockImplementation(async () => {
        callOrder.push('lookup');
        findOneCalls += 1;
        if (findOneCalls === 1) {
          return mockTicketEntity({ id: 7, deletedAt: new Date() });
        }
        return restored;
      });
      ticketRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await service.restore(7, 2);

      expect(callOrder[0]).toBe('transaction');
      expect(callOrder.filter((step) => step === 'lookup')).toHaveLength(2);
    });

    it('throws NotFoundException when ticket is missing and writes no audit', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(service.restore(999, 2)).rejects.toBeInstanceOf(NotFoundException);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(ticketRepository.restore).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('throws when ticket is not soft-deleted and writes no audit', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ id: 7, deletedAt: null }),
      );

      await expect(service.restore(7, 2)).rejects.toThrow();
      expect(ticketRepository.restore).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('propagates audit failure so restore transaction rolls back', async () => {
      ticketRepository.findOne
        .mockResolvedValueOnce(mockTicketEntity({ id: 7, deletedAt: new Date() }))
        .mockResolvedValueOnce(mockTicketEntity({ id: 7, deletedAt: null }));
      ticketRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.restore(7, 2)).rejects.toThrow('audit insert failed');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(ticketRepository.restore).toHaveBeenCalledTimes(1);
    });
  });
});
