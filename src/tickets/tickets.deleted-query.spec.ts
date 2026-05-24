import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { ProjectsService } from '../projects/projects.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { UsersService } from '../users/users.service';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Ticket } from './entities/ticket.entity';
import { ticketDependencyRepositoryProvider } from './testing/dependency.fixtures';
import { TicketsService } from './tickets.service';
import { mockTicketEntity } from './testing/ticket.fixtures';

/**
 * Regression: deleted-list queries must filter at the DB layer via TypeORM
 * where clauses — not by loading rows and filtering in application memory.
 */
describe('TicketsService deleted query (DB-level regression)', () => {
  let service: TicketsService;
  let ticketRepository: jest.Mocked<Pick<Repository<Ticket>, 'find' | 'findOne'>>;

  beforeEach(async () => {
    ticketRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<Ticket>, 'find' | 'findOne'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepository },
        ticketDependencyRepositoryProvider(),
        {
          provide: ProjectsService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockProjectResponse()) },
        },
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
        },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map<unknown, object>([[Ticket, ticketRepository]]),
          ),
        },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  describe('findAllDeleted', () => {
    it('queries deleted tickets with projectId and deletedAt Not(IsNull())', async () => {
      const deleted = mockTicketEntity({
        id: 3,
        projectId: 5,
        deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      ticketRepository.find.mockResolvedValue([deleted]);

      await service.findAllDeleted(5);

      expect(ticketRepository.find).toHaveBeenCalledTimes(1);
      expect(ticketRepository.find).toHaveBeenCalledWith({
        where: { projectId: 5, deletedAt: Not(IsNull()) },
        withDeleted: true,
      });
    });

    it('does not fetch with withDeleted alone and filter deletedAt in memory', async () => {
      const deleted = mockTicketEntity({
        id: 3,
        projectId: 5,
        deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      ticketRepository.find.mockResolvedValue([deleted]);
      const filterSpy = jest.spyOn(Array.prototype, 'filter');

      await service.findAllDeleted(5);

      expect(filterSpy).not.toHaveBeenCalled();
      expect(ticketRepository.find).not.toHaveBeenCalledWith({
        withDeleted: true,
      });
      expect(ticketRepository.find).not.toHaveBeenCalledWith(
        expect.objectContaining({
          withDeleted: true,
          where: { projectId: 5 },
        }),
      );

      filterSpy.mockRestore();
    });

    it('returns only deleted tickets for the specified project', async () => {
      const deleted = mockTicketEntity({
        id: 9,
        projectId: 5,
        deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      ticketRepository.find.mockResolvedValue([deleted]);

      const result = await service.findAllDeleted(5);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 9, projectId: 5 });
    });
  });

  describe('standard queries exclude deleted rows', () => {
    it('findAll does not pass withDeleted or deletedAt filters', async () => {
      ticketRepository.find.mockResolvedValue([mockTicketEntity()]);

      await service.findAll(5);

      expect(ticketRepository.find).toHaveBeenCalledWith({
        where: { projectId: 5 },
      });
      expect(ticketRepository.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    });
  });
});
