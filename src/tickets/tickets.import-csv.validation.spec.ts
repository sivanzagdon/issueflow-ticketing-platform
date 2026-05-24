import { NotFoundException } from '@nestjs/common';
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
  TICKET_IMPORT_CSV_HEADER,
  TicketsServiceSlice14,
} from './testing/ticket-csv.fixtures';
import { TicketsService } from './tickets.service';

/**
 * Slice 14 — per-row CSV validation for ticket import.
 */
describe('TicketsService importTicketsFromCsv validation (Slice 14)', () => {
  let service: TicketsServiceSlice14;
  let ticketRepository: jest.Mocked<Repository<Ticket>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const importFile = (...dataRows: string[]) =>
    mockCsvFile(buildImportCsv(dataRows));

  beforeEach(async () => {
    ticketRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Ticket>>;
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    ticketRepository.save.mockImplementation(async (entity) => ({
      ...(entity as Ticket),
      id: 200,
      version: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isOverdue: false,
    }));
    usersService = {
      findOne: jest.fn().mockResolvedValue(mockUserResponse({ id: 2 })),
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

  const expectRowFailed = async (
    dataRow: string,
    matcher: RegExp | string,
  ): Promise<void> => {
    const result = await service.importTicketsFromCsv(
      5,
      importFile(dataRow),
      1,
    );
    expect(result.created).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.message).toEqual(
      typeof matcher === 'string' ? expect.stringContaining(matcher) : matcher,
    );
  };

  it.each([
    [
      'missing title',
      buildImportCsvRow({
        title: '',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
      /title/i,
    ],
    [
      'missing status',
      buildImportCsvRow({
        title: 'Has title',
        status: '' as TicketStatus,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      }),
      /status/i,
    ],
    [
      'missing priority',
      buildImportCsvRow({
        title: 'Has title',
        status: TicketStatus.TODO,
        priority: '' as TicketPriority,
        type: TicketType.FEATURE,
      }),
      /priority/i,
    ],
    [
      'missing type',
      buildImportCsvRow({
        title: 'Has title',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: '' as TicketType,
      }),
      /type/i,
    ],
    ['invalid status', 'Title,Desc,NOT_A_STATUS,MEDIUM,FEATURE,', /status/i],
    ['invalid priority', 'Title,Desc,TODO,NOT_A_PRIORITY,FEATURE,', /priority/i],
    ['invalid type', 'Title,Desc,TODO,MEDIUM,NOT_A_TYPE,', /type/i],
    ['malformed CSV row', '"unclosed quote,Desc,TODO,MEDIUM,FEATURE,', /csv|parse|malformed|quote/i],
  ] as const)('rejects row with %s', async (_label, row, matcher) => {
    await expectRowFailed(row, matcher);
    expect(ticketRepository.save).not.toHaveBeenCalled();
  });

  it('rejects invalid assigneeId when user does not exist', async () => {
    usersService.findOne.mockRejectedValue(
      new NotFoundException('User 999 not found'),
    );
    const row = buildImportCsvRow({
      title: 'Assigned ticket',
      status: TicketStatus.TODO,
      priority: TicketPriority.MEDIUM,
      type: TicketType.FEATURE,
      assigneeId: 999,
    });

    const result = await service.importTicketsFromCsv(5, importFile(row), 1);

    expect(result.failed).toBe(1);
    expect(result.created).toBe(0);
    expect(ticketRepository.save).not.toHaveBeenCalled();
  });

  it('accepts empty assigneeId as null assignee', async () => {
    const row = buildImportCsvRow({
      title: 'Unassigned',
      status: TicketStatus.TODO,
      priority: TicketPriority.MEDIUM,
      type: TicketType.FEATURE,
      assigneeId: '',
    });

    const result = await service.importTicketsFromCsv(5, importFile(row), 1);

    expect(result.created).toBe(1);
    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: null, projectId: 5 }),
    );
  });

  it('imports description containing commas', async () => {
    const row = buildImportCsvRow({
      title: 'Comma desc',
      description: 'Part one, part two',
      status: TicketStatus.TODO,
      priority: TicketPriority.MEDIUM,
      type: TicketType.FEATURE,
    });

    const result = await service.importTicketsFromCsv(5, importFile(row), 1);

    expect(result.created).toBe(1);
    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Part one, part two' }),
    );
  });

  it('imports description containing quotes', async () => {
    const row = buildImportCsvRow({
      title: 'Quoted desc',
      description: 'Say "hello"',
      status: TicketStatus.TODO,
      priority: TicketPriority.MEDIUM,
      type: TicketType.FEATURE,
    });

    const result = await service.importTicketsFromCsv(5, importFile(row), 1);

    expect(result.created).toBe(1);
    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Say "hello"' }),
    );
  });

  it('parses import CSV using expected column header', async () => {
    const file = mockCsvFile(
      `${TICKET_IMPORT_CSV_HEADER}\n${buildImportCsvRow({
        title: 'Header check',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
      })}\n`,
    );

    const result = await service.importTicketsFromCsv(5, file, 1);

    expect(result.created).toBe(1);
  });
});
