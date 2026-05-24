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
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import {
  AUDIT_ENTITY_TICKET_ATTACHMENT,
  createMockAttachmentRepository,
  mockAttachmentEntity,
  mockUploadFile,
  TicketAttachmentEntityStub,
  TicketsServiceSlice13,
} from './testing/attachment.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 13 — attachment mutations: transaction scope, manager repositories, audit ordering.
 */
describe('TicketsService attachments — transaction and audit (Slice 13)', () => {
  let service: TicketsServiceSlice13;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'findOne'>>;
  let attachmentRepository: ReturnType<typeof createMockAttachmentRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  beforeEach(async () => {
    ticketRepository = { findOne: jest.fn() };
    attachmentRepository = createMockAttachmentRepository();
    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepository;
      }
      if (entity === TicketAttachmentEntityStub) {
        return attachmentRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        {
          provide: getRepositoryToken(TicketAttachmentEntityStub),
          useValue: attachmentRepository,
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

    service = module.get(TicketsService) as TicketsServiceSlice13;
  });

  const activeTicket = (id: number) =>
    mockTicketEntity({ id, deletedAt: null });

  describe('createAttachment', () => {
    it('uses manager.getRepository for Ticket and TicketAttachment inside transaction', async () => {
      const transactionalTicketRepo = {
        findOne: jest.fn().mockResolvedValue(activeTicket(12)),
      };
      const transactionalAttachmentRepo = {
        ...attachmentRepository,
        save: jest
          .fn()
          .mockResolvedValue(
            mockAttachmentEntity({ id: 3, ticketId: 12, filename: 'a.png' }),
          ),
      };

      transactionalManager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Ticket) {
          return transactionalTicketRepo;
        }
        if (entity === TicketAttachmentEntityStub) {
          return transactionalAttachmentRepo;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as unknown as typeof transactionalManager.getRepository;

      ticketRepository.findOne.mockImplementation(() => {
        throw new Error('non-transactional ticket repository must not be used');
      });
      attachmentRepository.save.mockImplementation(() => {
        throw new Error(
          'non-transactional attachment repository must not be used',
        );
      });

      await service.createAttachment(12, mockUploadFile({ originalname: 'a.png' }), 2);

      expect(transactionalManager.getRepository).toHaveBeenCalledWith(Ticket);
      expect(transactionalManager.getRepository).toHaveBeenCalledWith(
        TicketAttachmentEntityStub,
      );
      expect(transactionalTicketRepo.findOne).toHaveBeenCalled();
      expect(transactionalAttachmentRepo.save).toHaveBeenCalled();
    });

    it('records audit only after attachment save succeeds', async () => {
      const callOrder: string[] = [];
      ticketRepository.findOne.mockResolvedValue(activeTicket(12));
      attachmentRepository.save.mockImplementation(async () => {
        callOrder.push('save');
        return mockAttachmentEntity({ id: 8, ticketId: 12, filename: 'z.png' });
      });
      auditLogService.record.mockImplementation(async () => {
        callOrder.push('audit');
        return { id: 1 } as never;
      });

      await service.createAttachment(
        12,
        mockUploadFile({ originalname: 'z.png' }),
        2,
      );

      expect(callOrder).toEqual(['save', 'audit']);
    });

    it('writes exactly one CREATE audit on success', async () => {
      ticketRepository.findOne.mockResolvedValue(activeTicket(12));
      attachmentRepository.save.mockResolvedValue(
        mockAttachmentEntity({ id: 4, ticketId: 12, filename: 'one.png' }),
      );

      await service.createAttachment(
        12,
        mockUploadFile({ originalname: 'one.png' }),
        2,
      );

      expect(auditLogService.record).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.CREATE,
        entityType: AUDIT_ENTITY_TICKET_ATTACHMENT,
      });
    });
  });

  describe('removeAttachment', () => {
    it('uses manager.getRepository inside transaction for delete flow', async () => {
      const transactionalTicketRepo = {
        findOne: jest.fn().mockResolvedValue(activeTicket(12)),
      };
      const transactionalAttachmentRepo = {
        findOne: jest
          .fn()
          .mockResolvedValue(
            mockAttachmentEntity({ id: 6, ticketId: 12, filename: 'rm.png' }),
          ),
        softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      transactionalManager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Ticket) {
          return transactionalTicketRepo;
        }
        if (entity === TicketAttachmentEntityStub) {
          return transactionalAttachmentRepo;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as unknown as typeof transactionalManager.getRepository;

      attachmentRepository.softDelete.mockImplementation(() => {
        throw new Error(
          'non-transactional attachment repository must not be used',
        );
      });

      await service.removeAttachment(12, 6, 2);

      expect(transactionalAttachmentRepo.softDelete).toHaveBeenCalledWith(6);
    });

    it('records audit only after soft delete succeeds', async () => {
      const callOrder: string[] = [];
      ticketRepository.findOne.mockResolvedValue(activeTicket(12));
      attachmentRepository.findOne.mockResolvedValue(
        mockAttachmentEntity({ id: 6, ticketId: 12, filename: 'rm.png' }),
      );
      attachmentRepository.softDelete.mockImplementation(async () => {
        callOrder.push('delete');
        return { affected: 1, raw: [], generatedMaps: [] };
      });
      auditLogService.record.mockImplementation(async () => {
        callOrder.push('audit');
        return { id: 1 } as never;
      });

      await service.removeAttachment(12, 6, 2);

      expect(callOrder).toEqual(['delete', 'audit']);
    });

    it('does not write audit when attachment lookup fails', async () => {
      ticketRepository.findOne.mockResolvedValue(activeTicket(12));
      attachmentRepository.findOne.mockResolvedValue(null);

      await expect(service.removeAttachment(12, 404, 2)).rejects.toThrow();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
