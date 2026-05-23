import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { AuditLogService } from './audit-log.service';
import { toAuditLogResponse } from './audit-log.mapper';
import { AuditLog } from './entities/audit-log.entity';
import {
  mockAuditLogEntity,
  mockSystemAuditLogEntity,
} from './testing/audit-log.fixtures';

/**
 * README GET /audit-logs response contract:
 * { id, action, entityType, entityId, performedBy, actor, timestamp }
 *
 * Internal persistence may use actorType/createdAt; public API must match README.
 */
describe('Audit log API contract (README)', () => {
  describe('toAuditLogResponse', () => {
    it('exposes actor and timestamp instead of actorType and createdAt', () => {
      const log = mockAuditLogEntity({
        actorType: AuditActor.USER,
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
      });

      const response = toAuditLogResponse(log) as Record<string, unknown>;

      expect(response).toMatchObject({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        performedBy: log.performedBy,
        actor: AuditActor.USER,
        timestamp: '2026-03-01T10:00:00.000Z',
      });
      expect(response).not.toHaveProperty('actorType');
      expect(response).not.toHaveProperty('createdAt');
    });

    it('exposes actor SYSTEM with performedBy null for system actions', () => {
      const log = mockSystemAuditLogEntity();

      const response = toAuditLogResponse(log) as Record<string, unknown>;

      expect(response.actor).toBe(AuditActor.SYSTEM);
      expect(response.performedBy).toBeNull();
      expect(response.timestamp).toBe(log.createdAt.toISOString());
    });
  });

  describe('AuditLogService.findAll', () => {
    let service: AuditLogService;
    let repository: jest.Mocked<Pick<Repository<AuditLog>, 'find'>>;

    beforeEach(async () => {
      repository = { find: jest.fn() } as unknown as jest.Mocked<
        Pick<Repository<AuditLog>, 'find'>
      >;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuditLogService,
          { provide: getRepositoryToken(AuditLog), useValue: repository },
        ],
      }).compile();

      service = module.get(AuditLogService);
    });

    it('returns README-shaped entries from GET /audit-logs', async () => {
      repository.find.mockResolvedValue([
        mockAuditLogEntity({
          id: 10,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.TICKET,
          entityId: 5,
          performedBy: 2,
          actorType: AuditActor.USER,
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
        }),
      ]);

      const [entry] = (await service.findAll({})) as Record<string, unknown>[];

      expect(entry).toMatchObject({
        id: 10,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TICKET,
        entityId: 5,
        performedBy: 2,
        actor: AuditActor.USER,
        timestamp: '2026-03-01T10:00:00.000Z',
      });
      expect(entry).not.toHaveProperty('actorType');
      expect(entry).not.toHaveProperty('createdAt');
    });
  });
});
