import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Ticket } from './entities/ticket.entity';
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
 * Slice 14 — imported ticket persistence rules.
 */
describe('TicketsService importTicketsFromCsv persistence (Slice 14)', () => {
  let service: TicketsServiceSlice14;
  let ticketRepository: jest.Mocked<Repository<Ticket>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  beforeEach(async () => {
    ticketRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Ticket>>;
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    ticketRepository.save.mockImplementation(async (entity) => ({
      ...(entity as Ticket),
      id: 301,
      version: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isOverdue: false,
    }));
    usersService = {
      findOne: jest.fn().mockResolvedValue(mockUserResponse({ id: 7 })),
    };

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
        { provide: UsersService, useValue: usersService },
        { provide: AuditLogService, useValue: { record: jest.fn().mockResolvedValue({ id: 1 }) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(TicketsService) as TicketsServiceSlice14;
  });

  it('persists valid rows under projectId from form field', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Scoped import',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);

    await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(ticketRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 5 }),
    );
    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 5 }),
    );
  });

  it('uses projectId from form field even when CSV text mentions another project', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Cross-project hint',
        description: 'projectId=99 should not override form projectId',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);

    await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 5 }),
    );
  });

  it('persists assigneeId when valid user exists', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Assigned',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
        assigneeId: 7,
      }),
    ]);

    await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(usersService.findOne).toHaveBeenCalledWith(7);
    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: 7 }),
    );
  });

  it('stores empty assigneeId as null', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'No assignee',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
        assigneeId: '',
      }),
    ]);

    await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: null }),
    );
  });

  it('does not require dueDate on import', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'No due date',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);

    await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: null }),
    );
  });

  it('applies existing ticket defaults for version and soft-delete fields', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Defaults check',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);

    await service.importTicketsFromCsv(5, mockCsvFile(csv), 1);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        deletedAt: null,
      }),
    );
  });
});
