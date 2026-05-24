import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { mockDataSourceWithRepositories } from '../audit-log/testing/transaction-test.helpers';
import { UsersService } from '../users/users.service';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';
import { mockProjectEntity } from './testing/project.fixtures';

/**
 * Regression: deleted-list queries must filter at the DB layer via TypeORM
 * where clauses — not by loading rows and filtering in application memory.
 */
describe('ProjectsService deleted query (DB-level regression)', () => {
  let service: ProjectsService;
  let projectRepository: jest.Mocked<Pick<Repository<Project>, 'find' | 'findOne'>>;

  beforeEach(async () => {
    projectRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<Project>, 'find' | 'findOne'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepository },
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
        },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
        {
          provide: DataSource,
          useValue: mockDataSourceWithRepositories(
            new Map<unknown, object>([[Project, projectRepository]]),
          ),
        },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  describe('findAllDeleted', () => {
    it('queries deleted projects with withDeleted and deletedAt Not(IsNull())', async () => {
      const deleted = mockProjectEntity({
        id: 3,
        deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      projectRepository.find.mockResolvedValue([deleted]);

      await service.findAllDeleted();

      expect(projectRepository.find).toHaveBeenCalledTimes(1);
      expect(projectRepository.find).toHaveBeenCalledWith({
        where: { deletedAt: Not(IsNull()) },
        withDeleted: true,
      });
    });

    it('does not fetch with withDeleted alone and filter deletedAt in memory', async () => {
      const deleted = mockProjectEntity({
        id: 3,
        deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      projectRepository.find.mockResolvedValue([deleted]);
      const filterSpy = jest.spyOn(Array.prototype, 'filter');

      await service.findAllDeleted();

      expect(filterSpy).not.toHaveBeenCalled();
      expect(projectRepository.find).not.toHaveBeenCalledWith({
        withDeleted: true,
      });
      expect(projectRepository.find).not.toHaveBeenCalledWith(
        expect.objectContaining({
          withDeleted: true,
          where: expect.not.objectContaining({
            deletedAt: Not(IsNull()),
          }),
        }),
      );

      filterSpy.mockRestore();
    });

    it('returns only deleted projects from the repository result', async () => {
      const deleted = mockProjectEntity({
        id: 7,
        deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      projectRepository.find.mockResolvedValue([deleted]);

      const result = await service.findAllDeleted();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 7 });
    });
  });

  describe('standard queries exclude deleted rows', () => {
    it('findAll does not pass withDeleted or deletedAt filters', async () => {
      projectRepository.find.mockResolvedValue([mockProjectEntity()]);

      await service.findAll();

      expect(projectRepository.find).toHaveBeenCalledWith();
      expect(projectRepository.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    });
  });
});
