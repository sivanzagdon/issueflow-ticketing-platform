import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { UsersService } from '../users/users.service';
import { mockProjectEntity } from './testing/project.fixtures';
import {
  expectProjectWorkloadListShape,
  mockAdminUser,
  mockDeveloperUsers,
  ProjectsServiceSlice15,
} from './testing/workload.fixtures';
import { Project } from './entities/project.entity';
import { User } from '../users/entities/user.entity';
import { ProjectsService } from './projects.service';

type WorkloadQueryBuilder = Pick<
  SelectQueryBuilder<User>,
  | 'leftJoin'
  | 'select'
  | 'addSelect'
  | 'where'
  | 'groupBy'
  | 'addGroupBy'
  | 'getRawMany'
>;

/**
 * Slice 15 — project workload calculation (README).
 */
describe('ProjectsService getProjectWorkload (Slice 15)', () => {
  let service: ProjectsServiceSlice15;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'createQueryBuilder'>>;
  let queryBuilder: jest.Mocked<WorkloadQueryBuilder>;
  let leftJoinParams: Record<string, unknown> | undefined;

  const mockAggregateRows = (
    developers: User[],
    counts: number[],
  ): Array<{
    userId: number;
    username: string;
    createdAt: Date;
    openTicketCount: string;
  }> =>
    developers.map((developer, index) => ({
      userId: developer.id,
      username: developer.username,
      createdAt: developer.createdAt,
      openTicketCount: String(counts[index] ?? 0),
    }));

  beforeEach(async () => {
    leftJoinParams = undefined;
    queryBuilder = {
      leftJoin: jest.fn().mockImplementation((_entity, _alias, _condition, params) => {
        leftJoinParams = params as Record<string, unknown>;
        return queryBuilder;
      }),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    projectRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Project>>;
    userRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map([[Project, projectRepository]]),
          ),
        },
      ],
    }).compile();

    service = module.get(ProjectsService) as ProjectsServiceSlice15;
  });

  it('requires project to exist', async () => {
    projectRepository.findOne.mockResolvedValue(null);

    await expect(service.getProjectWorkload(404)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns only DEVELOPER users with README workload shape', async () => {
    const developers = mockDeveloperUsers();
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    queryBuilder.getRawMany.mockResolvedValue(mockAggregateRows(developers, [2, 0]));

    const result = await service.getProjectWorkload(5);

    expectProjectWorkloadListShape(result);
    expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('developer');
    expect(queryBuilder.where).toHaveBeenCalledWith('developer.role = :role', {
      role: UserRole.DEVELOPER,
    });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.username)).toBe(true);
  });

  it('excludes ADMIN users from workload list', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    queryBuilder.getRawMany.mockResolvedValue(
      mockAggregateRows(mockDeveloperUsers(), [0, 0]),
    );

    await service.getProjectWorkload(5);

    expect(queryBuilder.where).toHaveBeenCalledWith('developer.role = :role', {
      role: UserRole.DEVELOPER,
    });
    expect(mockAdminUser().role).toBe(UserRole.ADMIN);
  });

  it('counts only non-DONE tickets for the requested project', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    queryBuilder.getRawMany.mockResolvedValue(
      mockAggregateRows([mockDeveloperUsers()[0]], [3]),
    );

    await service.getProjectWorkload(5);

    expect(leftJoinParams).toEqual(
      expect.objectContaining({
        projectId: 5,
        doneStatus: TicketStatus.DONE,
      }),
    );
    expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      'ticket',
      expect.stringContaining('ticket.status != :doneStatus'),
      expect.objectContaining({ doneStatus: TicketStatus.DONE }),
    );
  });

  it('excludes soft-deleted tickets from open counts', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    queryBuilder.getRawMany.mockResolvedValue(
      mockAggregateRows([mockDeveloperUsers()[0]], [1]),
    );

    await service.getProjectWorkload(5);

    expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      'ticket',
      expect.stringContaining('ticket.deleted_at IS NULL'),
      expect.anything(),
    );
  });

  it('scopes ticket counts to the requested project only', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 7 }));
    queryBuilder.getRawMany.mockResolvedValue(
      mockAggregateRows([mockDeveloperUsers()[0]], [0]),
    );

    await service.getProjectWorkload(7);

    expect(leftJoinParams).toEqual(
      expect.objectContaining({
        projectId: 7,
      }),
    );
  });

  it('sorts workload ascending by openTicketCount', async () => {
    const developers = mockDeveloperUsers();
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    queryBuilder.getRawMany.mockResolvedValue(mockAggregateRows(developers, [4, 1]));

    const result = await service.getProjectWorkload(5);

    expect(result[0].openTicketCount).toBeLessThanOrEqual(
      result[1].openTicketCount,
    );
    expect(result[0]).toEqual(
      expect.objectContaining({ userId: 11, openTicketCount: 1 }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({ userId: 10, openTicketCount: 4 }),
    );
  });

  it('includes developers with zero open tickets', async () => {
    const developers = mockDeveloperUsers();
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    queryBuilder.getRawMany.mockResolvedValue(mockAggregateRows(developers, [3, 0]));

    const result = await service.getProjectWorkload(5);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 10, openTicketCount: 3 }),
        expect.objectContaining({ userId: 11, openTicketCount: 0 }),
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('uses a single aggregate query instead of per-developer counts', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    queryBuilder.getRawMany.mockResolvedValue(
      mockAggregateRows(mockDeveloperUsers(), [2, 0]),
    );

    await service.getProjectWorkload(5);

    expect(userRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no developers exist', async () => {
    projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 5 }));
    queryBuilder.getRawMany.mockResolvedValue([]);

    const result = await service.getProjectWorkload(5);

    expect(result).toEqual([]);
    expect(userRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });
});
