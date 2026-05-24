import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
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
 * Slice 12 — dependency mutations: transaction scope, manager repositories, audit ordering.
 */
describe('TicketsService dependencies — transaction and audit (Slice 12)', () => {
  let service: TicketsServiceSlice12;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let dependencyRepository: ReturnType<typeof createMockDependencyRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

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

  describe('addDependency', () => {
    it('uses manager.getRepository for Ticket and TicketDependency inside transaction', async () => {
      const transactionalTicketRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(activeTicket(10))
          .mockResolvedValueOnce(activeTicket(42)),
      };
      const transactionalDependencyRepo = {
        ...dependencyRepository,
        save: jest
          .fn()
          .mockResolvedValue(
            mockDependencyEntity({ id: 5, ticketId: 10, blockerTicketId: 42 }),
          ),
      };

      transactionalManager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Ticket) {
          return transactionalTicketRepo;
        }
        if (entity === TicketDependencyEntityStub) {
          return transactionalDependencyRepo;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as unknown as typeof transactionalManager.getRepository;

      ticketRepository.findOne.mockImplementation(() => {
        throw new Error('non-transactional ticket repository must not be used');
      });
      dependencyRepository.save.mockImplementation(() => {
        throw new Error(
          'non-transactional dependency repository must not be used',
        );
      });

      await service.addDependency(10, 42, 2);

      expect(transactionalManager.getRepository).toHaveBeenCalledWith(Ticket);
      expect(transactionalManager.getRepository).toHaveBeenCalledWith(
        TicketDependencyEntityStub,
      );
      expect(transactionalTicketRepo.findOne).toHaveBeenCalled();
      expect(transactionalDependencyRepo.save).toHaveBeenCalled();
    });

    it('writes audit only after successful dependency save', async () => {
      const callOrder: string[] = [];
      ticketRepository.findOne
        .mockResolvedValueOnce(activeTicket(10))
        .mockResolvedValueOnce(activeTicket(42));
      dependencyRepository.save.mockImplementation(async () => {
        callOrder.push('save');
        return mockDependencyEntity({ id: 5, ticketId: 10, blockerTicketId: 42 });
      });
      auditLogService.record.mockImplementation(async () => {
        callOrder.push('audit');
        return { id: 1 } as never;
      });

      await service.addDependency(10, 42, 2);

      expect(callOrder).toEqual(['save', 'audit']);
    });

    it('does not write duplicate audit records on successful create', async () => {
      ticketRepository.findOne
        .mockResolvedValueOnce(activeTicket(10))
        .mockResolvedValueOnce(activeTicket(42));
      dependencyRepository.save.mockResolvedValue(
        mockDependencyEntity({ id: 5, ticketId: 10, blockerTicketId: 42 }),
      );

      await service.addDependency(10, 42, 2);

      expect(auditLogService.record).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.CREATE,
        entityType: AUDIT_ENTITY_TICKET_DEPENDENCY,
      });
    });
  });

  describe('removeDependency', () => {
    it('writes audit only after successful dependency delete', async () => {
      const callOrder: string[] = [];
      ticketRepository.findOne
        .mockResolvedValueOnce(activeTicket(10))
        .mockResolvedValueOnce(activeTicket(42));
      dependencyRepository.findOne.mockResolvedValue(
        mockDependencyEntity({ id: 7, ticketId: 10, blockerTicketId: 42 }),
      );
      dependencyRepository.delete.mockImplementation(async () => {
        callOrder.push('delete');
        return { affected: 1, raw: [], generatedMaps: [] };
      });
      auditLogService.record.mockImplementation(async () => {
        callOrder.push('audit');
        return { id: 1 } as never;
      });

      await service.removeDependency(10, 42, 2);

      expect(callOrder).toEqual(['delete', 'audit']);
    });

    it('does not write duplicate audit records on successful remove', async () => {
      ticketRepository.findOne
        .mockResolvedValueOnce(activeTicket(10))
        .mockResolvedValueOnce(activeTicket(42));
      dependencyRepository.findOne.mockResolvedValue(
        mockDependencyEntity({ id: 7, ticketId: 10, blockerTicketId: 42 }),
      );

      await service.removeDependency(10, 42, 2);

      expect(auditLogService.record).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.DELETE,
        entityType: AUDIT_ENTITY_TICKET_DEPENDENCY,
      });
    });
  });
});
