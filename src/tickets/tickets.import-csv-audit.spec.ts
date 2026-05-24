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
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketAttachmentRepositoryProvider } from './testing/attachment.fixtures';
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import {
  buildImportCsv,
  buildImportCsvRow,
  mockCsvFile,
  TicketsServiceSlice14,
} from './testing/ticket-csv.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 14 — import audit log behavior (transactional per successful row).
 */
describe('TicketsService importTicketsFromCsv audit (Slice 14)', () => {
  let service: TicketsServiceSlice14;
  let ticketRepository: jest.Mocked<Repository<Ticket>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  beforeEach(async () => {
    ticketRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Ticket>>;
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        ticketAttachmentRepositoryProvider(),
        {
          provide: ProjectsService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockProjectResponse({ id: 5 })) },
        },
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse({ id: 1 })) },
        },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TicketsService) as TicketsServiceSlice14;
  });

  const transactionalTicketRepo = (saveImpl: jest.Mock) => ({
    create: jest.fn((entity: Ticket) => entity),
    save: saveImpl,
  });

  it('writes Audit Log for each successfully imported ticket inside transaction', async () => {
    const save = jest
      .fn()
      .mockResolvedValueOnce(mockTicketEntity({ id: 10, projectId: 5 }))
      .mockResolvedValueOnce(mockTicketEntity({ id: 11, projectId: 5 }));

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return transactionalTicketRepo(save);
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Audit one',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
      buildImportCsvRow({
        title: 'Audit two',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);

    const result = await service.importTicketsFromCsv(5, mockCsvFile(csv), 42);

    expect(result.created).toBe(2);
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(auditLogService.record).toHaveBeenCalledTimes(2);
    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AuditAction.CREATE,
      actorType: AuditActor.USER,
      entityType: AuditEntityType.TICKET,
      performedBy: 42,
    });
  });

  it('does not write Audit Log for failed validation rows', async () => {
    const save = jest.fn();
    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return transactionalTicketRepo(save);
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const csv = buildImportCsv([
      buildImportCsvRow({
        title: '',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);

    const result = await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(result.failed).toBe(1);
    expect(save).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('marks row as failed when audit write fails after ticket save', async () => {
    const save = jest
      .fn()
      .mockResolvedValueOnce(mockTicketEntity({ id: 20, projectId: 5 }));
    auditLogService.record.mockRejectedValueOnce(new Error('audit failed'));

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return transactionalTicketRepo(save);
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Audit failure row',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);

    const result = await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(result.created).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back ticket persistence when audit fails within the same transaction', async () => {
    const save = jest.fn().mockResolvedValue(mockTicketEntity({ id: 21, projectId: 5 }));
    auditLogService.record.mockRejectedValueOnce(new Error('audit failed'));

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return transactionalTicketRepo(save);
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    dataSource.transaction.mockImplementationOnce(
      async (work: (manager: EntityManager) => Promise<unknown>) => {
        try {
          return await work(transactionalManager);
        } catch {
          throw new Error('rolled back');
        }
      },
    );

    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Rollback row',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);

    await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(save).toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalled();
  });
});
