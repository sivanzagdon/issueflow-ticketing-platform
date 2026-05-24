import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { ProjectsService } from '../projects/projects.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import {
  mockWorkloadEntry,
  ProjectsServiceSlice15,
} from '../projects/testing/workload.fixtures';
import { UsersService } from '../users/users.service';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import { mockTicketEntity } from './testing/ticket.fixtures';
import { ticketAttachmentRepositoryProvider } from './testing/attachment.fixtures';
import {
  createMockDependencyRepository,
  ticketDependencyRepositoryProvider,
} from './testing/dependency.fixtures';
import { TicketDependency } from './entities/ticket-dependency.entity';
import { TicketsService } from './tickets.service';

/**
 * Slice 15 — automatic ticket assignment on create (README).
 */
describe('TicketsService auto-assignment (Slice 15)', () => {
  let service: TicketsService;
  let ticketRepository: jest.Mocked<Repository<Ticket>>;
  let projectsService: jest.Mocked<
    Pick<ProjectsServiceSlice15, 'findOne' | 'getProjectWorkload'>
  >;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const baseCreateDto: CreateTicketDto = {
    title: 'Auto assign ticket',
    description: 'Desc',
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    type: TicketType.BUG,
    projectId: 5,
  };

  beforeEach(async () => {
    ticketRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<Repository<Ticket>>;
    projectsService = {
      findOne: jest.fn().mockResolvedValue(mockProjectResponse({ id: 5 })),
      getProjectWorkload: jest.fn(),
    };
    usersService = { findOne: jest.fn() };

    const dependencyRepository = createMockDependencyRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        ticketAttachmentRepositoryProvider(),
        { provide: ProjectsService, useValue: projectsService },
        { provide: UsersService, useValue: usersService },
        {
          provide: AuditLogService,
          useValue: {
            record: jest.fn().mockResolvedValue({ id: 1 }),
            buildTicketStateHistory: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map<unknown, object>([
              [Ticket, ticketRepository],
              [TicketDependency, dependencyRepository],
            ]),
          ),
        },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  it('assigns least-loaded developer when assigneeId is omitted', async () => {
    projectsService.getProjectWorkload.mockResolvedValue([
      mockWorkloadEntry({ userId: 10, username: 'busy', openTicketCount: 5 }),
      mockWorkloadEntry({ userId: 11, username: 'free', openTicketCount: 1 }),
    ]);
    const saved = mockTicketEntity({ id: 50, projectId: 5, assigneeId: 11 });
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    ticketRepository.save.mockResolvedValue(saved);

    const result = await service.create(baseCreateDto, 1);

    expect(projectsService.getProjectWorkload).toHaveBeenCalledWith(5);
    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: 11 }),
    );
    expect(result.assigneeId).toBe(11);
  });

  it('resolves ties by oldest registered developer', async () => {
    projectsService.getProjectWorkload.mockResolvedValue([
      mockWorkloadEntry({ userId: 10, username: 'older-dev', openTicketCount: 0 }),
      mockWorkloadEntry({ userId: 11, username: 'newer-dev', openTicketCount: 0 }),
    ]);
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    ticketRepository.save.mockResolvedValue(
      mockTicketEntity({ assigneeId: 10, projectId: 5 }),
    );

    await service.create(baseCreateDto);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: 10 }),
    );
  });

  it('leaves assigneeId null when no developers exist', async () => {
    projectsService.getProjectWorkload.mockResolvedValue([]);
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    ticketRepository.save.mockResolvedValue(
      mockTicketEntity({ assigneeId: null, projectId: 5 }),
    );

    const result = await service.create(baseCreateDto);

    expect(result.assigneeId).toBeNull();
    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: null }),
    );
  });

  it('uses explicit assigneeId and skips auto-assignment', async () => {
    const dto: CreateTicketDto = { ...baseCreateDto, assigneeId: 42 };
    usersService.findOne.mockResolvedValue(mockUserResponse({ id: 42 }));
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    ticketRepository.save.mockResolvedValue(
      mockTicketEntity({ assigneeId: 42, projectId: 5 }),
    );

    await service.create(dto);

    expect(projectsService.getProjectWorkload).not.toHaveBeenCalled();
    expect(usersService.findOne).toHaveBeenCalledWith(42);
    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: 42 }),
    );
  });

  it('does not run auto-assignment during ticket update', async () => {
    const ticket = mockTicketEntity({
      id: 7,
      projectId: 5,
      assigneeId: null,
      version: 1,
    });
    ticketRepository.findOne.mockResolvedValue(ticket);
    ticketRepository.save.mockResolvedValue({ ...ticket, title: 'Updated' });
    usersService.findOne.mockResolvedValue(mockUserResponse({ id: 20 }));

    await service.update(
      7,
      { version: 1, assigneeId: 20 } as UpdateTicketDto,
      1,
    );

    expect(projectsService.getProjectWorkload).not.toHaveBeenCalled();
  });

  it('scopes auto-assignment workload to the ticket project', async () => {
    projectsService.getProjectWorkload.mockResolvedValue([
      mockWorkloadEntry({ userId: 11, openTicketCount: 0 }),
    ]);
    ticketRepository.create.mockImplementation((entity) => entity as Ticket);
    ticketRepository.save.mockResolvedValue(
      mockTicketEntity({ assigneeId: 11, projectId: 5 }),
    );

    await service.create({ ...baseCreateDto, projectId: 5 });

    expect(projectsService.getProjectWorkload).toHaveBeenCalledTimes(1);
    expect(projectsService.getProjectWorkload).toHaveBeenCalledWith(5);
  });
});
