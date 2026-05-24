import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { mockAuditLogResponse } from '../audit-log/testing/audit-log.fixtures';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import {
  createMockTransactionalContext,
  expectTransactionalAuditCall,
} from '../audit-log/testing/transaction-test.helpers';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { ProjectsService } from '../projects/projects.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import {
  AUDIT_ACTION_AUTO_ASSIGN,
  expectAutoAssignAuditPayload,
  mockWorkloadEntry,
  ProjectsServiceSlice15,
} from '../projects/testing/workload.fixtures';
import { UsersService } from '../users/users.service';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketAttachmentRepositoryProvider } from './testing/attachment.fixtures';
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 15 — AUTO_ASSIGN audit behavior (transactional with ticket create).
 */
describe('TicketsService auto-assignment audit (Slice 15)', () => {
  let service: TicketsService;
  let ticketRepository: jest.Mocked<Repository<Ticket>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let projectsService: jest.Mocked<
    Pick<ProjectsServiceSlice15, 'findOne' | 'getProjectWorkload'>
  >;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  const createDto: CreateTicketDto = {
    title: 'Audit auto assign',
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    type: TicketType.BUG,
    projectId: 5,
  };

  beforeEach(async () => {
    ticketRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Ticket>>;
    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };
    projectsService = {
      findOne: jest.fn().mockResolvedValue(mockProjectResponse({ id: 5 })),
      getProjectWorkload: jest.fn().mockResolvedValue([
        mockWorkloadEntry({ userId: 11, openTicketCount: 0 }),
      ]),
    };

    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        ticketAttachmentRepositoryProvider(),
        { provide: ProjectsService, useValue: projectsService },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  const transactionalTicketRepo = () => ({
    create: jest.fn((entity: Ticket) => entity),
    save: jest
      .fn()
      .mockResolvedValue(mockTicketEntity({ id: 60, projectId: 5, assigneeId: 11 })),
  });

  it('writes AUTO_ASSIGN audit with SYSTEM actor inside ticket create transaction', async () => {
    const ticketRepo = transactionalTicketRepo();
    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepo;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    await service.create(createDto, 1);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenCalledTimes(2);
    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AuditAction.CREATE,
      actorType: AuditActor.USER,
      entityType: AuditEntityType.TICKET,
    });
    expectTransactionalAuditCall(auditLogService, transactionalManager, {
      action: AUDIT_ACTION_AUTO_ASSIGN,
      actorType: AuditActor.SYSTEM,
      performedBy: null,
      entityType: AuditEntityType.TICKET,
      entityId: 60,
    });
  });

  it('does not write AUTO_ASSIGN audit when assigneeId is explicit', async () => {
    const ticketRepo = transactionalTicketRepo();
    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepo;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const usersService = { findOne: jest.fn().mockResolvedValue(mockUserResponse({ id: 42 })) };
    const module = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        ticketAttachmentRepositoryProvider(),
        { provide: ProjectsService, useValue: projectsService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    const explicitService = module.get(TicketsService);

    await explicitService.create({ ...createDto, assigneeId: 42 }, 1);

    const autoAssignCalls = auditLogService.record.mock.calls.filter(
      ([input]) => input.action === AUDIT_ACTION_AUTO_ASSIGN,
    );
    expect(autoAssignCalls).toHaveLength(0);
    expect(auditLogService.record).toHaveBeenCalledTimes(1);
  });

  it('marks assignment failed when AUTO_ASSIGN audit write fails', async () => {
    const ticketRepo = transactionalTicketRepo();
    auditLogService.record
      .mockResolvedValueOnce(mockAuditLogResponse({ id: 1 }))
      .mockRejectedValueOnce(new Error('audit failed'));

    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepo;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    await expect(service.create(createDto, 1)).rejects.toThrow();

    expect(ticketRepo.save).toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledTimes(2);
  });

  it('includes assignedTo in AUTO_ASSIGN audit details', async () => {
    const ticketRepo = transactionalTicketRepo();
    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Ticket) {
        return ticketRepo;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    await service.create(createDto, 1);

    const autoAssignCall = auditLogService.record.mock.calls.find(
      ([input]) => input.action === AUDIT_ACTION_AUTO_ASSIGN,
    );
    expect(autoAssignCall).toBeDefined();
    expectAutoAssignAuditPayload(
      autoAssignCall![0] as unknown as Record<string, unknown>,
    );
  });
});
