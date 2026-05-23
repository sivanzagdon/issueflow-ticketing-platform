import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
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
import { mockProjectEntity } from './testing/project.fixtures';

type ProjectsServiceSlice9 = ProjectsService & {
  findAllDeleted(): Promise<unknown[]>;
  restore(id: number, performedBy?: number): Promise<unknown>;
};

describe('ProjectsService soft delete and restore (slice 9)', () => {
  let service: ProjectsServiceSlice9;
  let projectRepository: jest.Mocked<
    Pick<
      Repository<Project>,
      'find' | 'findOne' | 'softDelete' | 'restore' | 'delete'
    >
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let dataSource: { transaction: jest.Mock };
  let transactionalManager: ReturnType<
    typeof createMockTransactionalContext
  >['manager'];

  beforeEach(async () => {
    projectRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      delete: jest.fn(),
    };

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
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockUserResponse()) },
        },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ProjectsService) as ProjectsServiceSlice9;
  });

  describe('remove (soft delete only)', () => {
    it('soft-deletes via repository.softDelete and never hard-deletes', async () => {
      projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 3 }));
      projectRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.remove(3, 1);

      expect(projectRepository.softDelete).toHaveBeenCalledWith({ id: 3 });
      expect(projectRepository.delete).not.toHaveBeenCalled();
    });

    it('records DELETE audit for PROJECT inside transaction', async () => {
      projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 3 }));
      projectRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.remove(3, 1);

      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.DELETE,
        entityType: AuditEntityType.PROJECT,
        entityId: 3,
        performedBy: 1,
        actorType: AuditActor.USER,
      });
    });

    it('does not write audit when softDelete fails', async () => {
      projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 3 }));
      projectRepository.softDelete.mockRejectedValue(new Error('delete failed'));

      await expect(service.remove(3, 1)).rejects.toThrow('delete failed');
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('rolls back soft delete when audit record fails', async () => {
      projectRepository.findOne.mockResolvedValue(mockProjectEntity({ id: 3 }));
      projectRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.remove(3, 1)).rejects.toThrow('audit insert failed');
    });

    it('throws NotFoundException when deleting a missing project', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(projectRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('standard query visibility', () => {
    it('findAll excludes soft-deleted projects by default', async () => {
      projectRepository.find.mockResolvedValue([mockProjectEntity()]);

      await service.findAll();

      expect(projectRepository.find).toHaveBeenCalled();
      expect(projectRepository.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    });

    it('findOne throws NotFoundException when project is soft-deleted', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(3)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAllDeleted (GET /projects/deleted)', () => {
    it('returns only soft-deleted projects', async () => {
      const deleted = mockProjectEntity({
        id: 3,
        deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      projectRepository.find.mockResolvedValue([deleted]);

      const result = await service.findAllDeleted();

      expect(projectRepository.find).toHaveBeenCalledWith({
        where: { deletedAt: Not(IsNull()) },
        withDeleted: true,
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 3 });
    });
  });

  describe('restore (POST /projects/:projectId/restore)', () => {
    it('restores soft-deleted project and records RESTORE audit atomically', async () => {
      projectRepository.findOne
        .mockResolvedValueOnce(mockProjectEntity({ id: 3, deletedAt: new Date() }))
        .mockResolvedValueOnce(mockProjectEntity({ id: 3, deletedAt: null }));
      projectRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      const result = await service.restore(3, 1);

      expect(projectRepository.restore).toHaveBeenCalledWith({ id: 3 });
      expectTransactionalAuditCall(auditLogService, transactionalManager, {
        action: AuditAction.RESTORE,
        entityType: AuditEntityType.PROJECT,
        entityId: 3,
        performedBy: 1,
        actorType: AuditActor.USER,
      });
      expect(result).toMatchObject({ id: 3 });
    });

    it('throws when restoring a project that is not soft-deleted', async () => {
      projectRepository.findOne.mockResolvedValue(
        mockProjectEntity({ id: 3, deletedAt: null }),
      );

      await expect(service.restore(3, 1)).rejects.toThrow();
      expect(projectRepository.restore).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when restoring a missing project', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(service.restore(999, 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rolls back restore when audit record fails', async () => {
      projectRepository.findOne
        .mockResolvedValueOnce(mockProjectEntity({ id: 3, deletedAt: new Date() }))
        .mockResolvedValueOnce(mockProjectEntity({ id: 3, deletedAt: null }));
      projectRepository.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      auditLogService.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.restore(3, 1)).rejects.toThrow('audit insert failed');
    });
  });
});
