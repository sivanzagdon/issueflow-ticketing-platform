import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Ticket } from './entities/ticket.entity';
import {
  createMockAttachmentRepository,
  ticketAttachmentRepositoryProvider,
} from './testing/attachment.fixtures';
import {
  createMockDependencyRepository,
  ticketDependencyRepositoryProvider,
} from './testing/dependency.fixtures';
import { TicketAttachment } from './entities/ticket-attachment.entity';
import { TicketDependency } from './entities/ticket-dependency.entity';
import {
  buildImportCsv,
  buildImportCsvRow,
  expectTicketImportResultShape,
  mockCsvFile,
  TicketsServiceSlice14,
} from './testing/ticket-csv.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 14 — import tickets from CSV (README summary contract).
 */
describe('TicketsService importTicketsFromCsv (Slice 14)', () => {
  let service: TicketsServiceSlice14;
  let ticketRepository: jest.Mocked<Repository<Ticket>>;
  let projectsService: jest.Mocked<Pick<ProjectsService, 'findOne'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  beforeEach(async () => {
    ticketRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Ticket>>;
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    ticketRepository.save.mockImplementation(async (entity) => ({
      ...(entity as Ticket),
      id: 100,
      version: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isOverdue: false,
    }));
    projectsService = {
      findOne: jest.fn().mockResolvedValue(mockProjectResponse({ id: 5 })),
    };
    usersService = {
      findOne: jest.fn().mockResolvedValue(mockUserResponse({ id: 2 })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        ticketAttachmentRepositoryProvider(),
        { provide: ProjectsService, useValue: projectsService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditLogService, useValue: { record: jest.fn().mockResolvedValue({ id: 1 }) } },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map<unknown, object>([
              [Ticket, ticketRepository],
              [TicketDependency, createMockDependencyRepository()],
              [TicketAttachment, createMockAttachmentRepository()],
            ]),
          ),
        },
      ],
    }).compile();

    service = module.get(TicketsService) as TicketsServiceSlice14;
  });

  it('requires project to exist before import', async () => {
    projectsService.findOne.mockRejectedValue(
      new NotFoundException('Project 99 not found'),
    );
    const file = mockCsvFile(buildImportCsv([]));

    await expect(service.importTicketsFromCsv(99, file)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates tickets from valid CSV rows', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Imported one',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
      }),
      buildImportCsvRow({
        title: 'Imported two',
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.LOW,
        type: TicketType.FEATURE,
      }),
    ]);
    const file = mockCsvFile(csv);

    const result = await service.importTicketsFromCsv(5, file, 1);

    expectTicketImportResultShape(result);
    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
    expect(ticketRepository.save).toHaveBeenCalledTimes(2);
  });

  it('skips invalid rows and reports them in errors', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'Valid row',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
      ',,,,,',
    ]);
    const file = mockCsvFile(csv);

    const result = await service.importTicketsFromCsv(5, file, 1);

    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual(
      expect.objectContaining({
        row: expect.any(Number),
        message: expect.any(String),
      }),
    );
  });

  it('continues importing when some rows fail', async () => {
    const csv = buildImportCsv([
      buildImportCsvRow({
        title: 'First ok',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
      buildImportCsvRow({
        title: '',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
      buildImportCsvRow({
        title: 'Third ok',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
    ]);
    const file = mockCsvFile(csv);

    const result = await service.importTicketsFromCsv(5, file, 1);

    expect(result).toEqual({
      created: 2,
      failed: 1,
      errors: expect.arrayContaining([
        expect.objectContaining({ row: expect.any(Number) }),
      ]),
    });
    expect(ticketRepository.save).toHaveBeenCalledTimes(2);
  });

  it('returns exact README summary keys only', async () => {
    const file = mockCsvFile(buildImportCsv([]));

    const result = await service.importTicketsFromCsv(5, file);

    expect(Object.keys(result).sort()).toEqual(['created', 'errors', 'failed']);
    expectTicketImportResultShape(result);
  });
});
