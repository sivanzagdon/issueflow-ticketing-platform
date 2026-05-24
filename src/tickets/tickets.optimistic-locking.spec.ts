import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { ProjectsService } from '../projects/projects.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { UsersService } from '../users/users.service';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 10 — ticket optimistic locking / concurrent edit prevention.
 */
describe('TicketsService optimistic locking (Slice 10)', () => {
  let service: TicketsService;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne' | 'save'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record' | 'buildTicketStateHistory'>>;
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

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    auditLogService = {
      record: jest.fn().mockResolvedValue({ id: 1 }),
      buildTicketStateHistory: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
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

  const mockSaveIncrementsVersion = () => {
    ticketRepository.save.mockImplementation(async (entity: Ticket) => ({
      ...entity,
      version: entity.version + 1,
    }));
  };

  describe('update', () => {
    it('succeeds when submitted version matches persisted version', async () => {
      const existing = mockTicketEntity({ version: 2, title: 'Before' });
      ticketRepository.findOne.mockResolvedValue(existing);
      mockSaveIncrementsVersion();

      const result = await service.update(1, { version: 2, title: 'After' });

      expect(result.title).toBe('After');
      expect(ticketRepository.save).toHaveBeenCalledTimes(1);
    });

    it('increments ticket version on successful update', async () => {
      const existing = mockTicketEntity({ version: 3, title: 'Before' });
      ticketRepository.findOne.mockResolvedValue(existing);
      mockSaveIncrementsVersion();

      const result = await service.update(1, { version: 3, title: 'After' });

      expect(result.version).toBe(4);
    });

    it('fails with ConflictException when submitted version is stale', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ version: 5, title: 'Current' }),
      );

      await expect(
        service.update(1, { version: 4, title: 'Stale' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not persist mutation when version is stale', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ version: 2, title: 'Current' }),
      );

      await expect(
        service.update(1, { version: 1, title: 'Stale' }),
      ).rejects.toThrow();

      expect(ticketRepository.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('does not write Audit Log when version is stale', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ version: 2 }));

      await expect(
        service.update(1, { version: 1, title: 'Stale' }),
      ).rejects.toThrow();

      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('detects version conflict before save and audit', async () => {
      const callOrder: string[] = [];
      ticketRepository.findOne.mockImplementation(async () => {
        callOrder.push('lookup');
        return mockTicketEntity({ version: 2 });
      });
      dataSource.transaction.mockImplementation(async (work) => {
        callOrder.push('transaction');
        return work(transactionalManager);
      });
      ticketRepository.save.mockImplementation(async () => {
        callOrder.push('save');
        return mockTicketEntity({ version: 3 });
      });
      auditLogService.record.mockImplementation(async (..._args) => {
        callOrder.push('audit');
        return { id: 1 } as Awaited<ReturnType<AuditLogService['record']>>;
      });

      await expect(
        service.update(1, { version: 1, title: 'Stale' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(callOrder).toEqual(['lookup']);
      expect(callOrder).not.toContain('save');
      expect(callOrder).not.toContain('audit');
      expect(callOrder).not.toContain('transaction');
    });

    it('writes UPDATE audit inside the same transaction on success', async () => {
      const existing = mockTicketEntity({ version: 1, title: 'Before' });
      ticketRepository.findOne.mockResolvedValue(existing);
      mockSaveIncrementsVersion();

      await service.update(1, { version: 1, title: 'After' }, 9);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TICKET,
        entityId: 1,
        performedBy: 9,
      });
      expect(auditLogService.record).toHaveBeenCalledTimes(1);
    });

    it('propagates audit failure so update transaction rolls back', async () => {
      ticketRepository.findOne.mockResolvedValue(mockTicketEntity({ version: 1 }));
      mockSaveIncrementsVersion();
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(
        service.update(1, { version: 1, title: 'After' }),
      ).rejects.toThrow('audit insert failed');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(ticketRepository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects update when ticket status is DONE', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ status: TicketStatus.DONE, version: 1 }),
      );

      await expect(
        service.update(1, { version: 1, title: 'Blocked' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(ticketRepository.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('rejects backward status transition even when version matches', async () => {
      ticketRepository.findOne.mockResolvedValue(
        mockTicketEntity({ status: TicketStatus.IN_PROGRESS, version: 1 }),
      );

      await expect(
        service.update(1, { version: 1, status: TicketStatus.TODO }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(ticketRepository.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when ticket is missing', async () => {
      ticketRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, { version: 1, title: 'Missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(ticketRepository.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
