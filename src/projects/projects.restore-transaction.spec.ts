import { NotFoundException } from '@nestjs/common';
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
import { UsersService } from '../users/users.service';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';
import { projectsServiceWorkloadRepositoryProviders } from './testing/projects-service-test.providers';
import { mockProjectEntity } from './testing/project.fixtures';

/**
 * Regression: project restore must run lookup, mutation, post-restore fetch,
 * and RESTORE audit entirely inside one dataSource.transaction.
 */
describe('ProjectsService restore transaction boundary (regression)', () => {
  let service: ProjectsService;
  let projectRepository: jest.Mocked<
    Pick<Repository<Project>, 'findOne' | 'restore'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: EntityManager;

  beforeEach(async () => {
    projectRepository = {
      findOne: jest.fn(),
      restore: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<Project>, 'findOne' | 'restore'>>;

    auditLogService = { record: jest.fn().mockResolvedValue({ id: 1 }) };

    const ctx = createMockTransactionalContext();
    dataSource = ctx.dataSource;
    transactionalManager = ctx.manager;
    transactionalManager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Project) {
        return projectRepository;
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }) as unknown as typeof transactionalManager.getRepository;

    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepository },
        ...projectsServiceWorkloadRepositoryProviders(),
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
        },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  describe('restore', () => {
    it('runs lookup, restore, and audit inside dataSource.transaction', async () => {
      const restored = mockProjectEntity({ id: 3, deletedAt: null });
      projectRepository.findOne
        .mockResolvedValueOnce(mockProjectEntity({ id: 3, deletedAt: new Date() }))
        .mockResolvedValueOnce(restored);
      projectRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      const result = await service.restore(3, 1);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(projectRepository.restore).toHaveBeenCalledTimes(1);
      expect(auditLogService.record).toHaveBeenCalledTimes(1);
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.RESTORE,
        entityType: AuditEntityType.PROJECT,
        entityId: 3,
        performedBy: 1,
        actorType: AuditActor.USER,
        details: {
          before: { deletedAt: expect.any(String) },
          after: { deletedAt: null },
        },
      });
      expect(result).toMatchObject({ id: 3 });
    });

    it('loads soft-deleted project via manager.getRepository(Project) with withDeleted inside transaction', async () => {
      const deleted = mockProjectEntity({ id: 3, deletedAt: new Date() });
      const restored = mockProjectEntity({ id: 3, deletedAt: null });
      const transactionalRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(deleted)
          .mockResolvedValueOnce(restored),
        restore: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
      };

      transactionalManager.getRepository = jest.fn((entity: unknown) => {
        if (entity === Project) {
          return transactionalRepo;
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }) as unknown as typeof transactionalManager.getRepository;

      projectRepository.findOne.mockImplementation(() => {
        throw new Error('injected repository must not be used for restore lookup');
      });

      await service.restore(3, 1);

      expect(transactionalManager.getRepository).toHaveBeenCalledWith(Project);
      expect(transactionalRepo.findOne).toHaveBeenNthCalledWith(1, {
        where: { id: 3 },
        withDeleted: true,
      });
      expect(transactionalRepo.restore).toHaveBeenCalledWith({ id: 3 });
    });

    it('starts transaction before restore lookup', async () => {
      const restored = mockProjectEntity({ id: 3, deletedAt: null });
      const callOrder: string[] = [];
      let findOneCalls = 0;

      dataSource.transaction.mockImplementation(async (work) => {
        callOrder.push('transaction');
        return work(transactionalManager);
      });
      projectRepository.findOne.mockImplementation(async () => {
        callOrder.push('lookup');
        findOneCalls += 1;
        if (findOneCalls === 1) {
          return mockProjectEntity({ id: 3, deletedAt: new Date() });
        }
        return restored;
      });
      projectRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await service.restore(3, 1);

      expect(callOrder[0]).toBe('transaction');
      expect(callOrder.filter((step) => step === 'lookup')).toHaveLength(2);
    });

    it('throws NotFoundException when project is missing and writes no audit', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(service.restore(999, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(projectRepository.restore).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('throws when project is not soft-deleted and writes no audit', async () => {
      projectRepository.findOne.mockResolvedValue(
        mockProjectEntity({ id: 3, deletedAt: null }),
      );

      await expect(service.restore(3, 1)).rejects.toThrow();
      expect(projectRepository.restore).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('propagates audit failure so restore transaction rolls back', async () => {
      projectRepository.findOne
        .mockResolvedValueOnce(mockProjectEntity({ id: 3, deletedAt: new Date() }))
        .mockResolvedValueOnce(mockProjectEntity({ id: 3, deletedAt: null }));
      projectRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.restore(3, 1)).rejects.toThrow('audit insert failed');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(projectRepository.restore).toHaveBeenCalledTimes(1);
    });
  });
});
