import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLog } from './entities/audit-log.entity';
import {
  mockAuditLogEntity,
  mockAuditLogResponse,
  mockSystemAuditLogEntity,
} from './testing/audit-log.fixtures';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let auditLogRepository: jest.Mocked<
    Pick<Repository<AuditLog>, 'create' | 'save' | 'find' | 'update' | 'delete'>
  >;

  beforeEach(async () => {
    auditLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<Repository<AuditLog>, 'create' | 'save' | 'find' | 'update' | 'delete'>
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: auditLogRepository },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  describe('record (append-only)', () => {
    it('creates audit entry via repository create and save', async () => {
      const entity = mockAuditLogEntity();
      auditLogRepository.create.mockReturnValue(entity);
      auditLogRepository.save.mockResolvedValue(entity);

      const result = await service.record({
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TICKET,
        entityId: 5,
        performedBy: 2,
        actorType: AuditActor.USER,
        details: { title: 'Bug', status: TicketStatus.TODO },
      });

      expect(auditLogRepository.create).toHaveBeenCalled();
      expect(auditLogRepository.save).toHaveBeenCalledWith(entity);
      expect(result).toMatchObject({
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TICKET,
        entityId: 5,
        performedBy: 2,
        actorType: AuditActor.USER,
      });
      expect(result.details).toEqual({
        title: 'Bug',
        status: TicketStatus.TODO,
      });
    });

    it('preserves jsonb details payload on response', async () => {
      const details = {
        from: TicketStatus.TODO,
        to: TicketStatus.IN_PROGRESS,
      };
      const entity = mockAuditLogEntity({
        action: AuditAction.UPDATE,
        details,
      });
      auditLogRepository.create.mockReturnValue(entity);
      auditLogRepository.save.mockResolvedValue(entity);

      const result = await service.record({
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TICKET,
        entityId: 5,
        performedBy: 2,
        actorType: AuditActor.USER,
        details,
      });

      expect(result.details).toEqual(details);
    });

    it('records USER actions with performedBy set', async () => {
      const entity = mockAuditLogEntity({
        performedBy: 7,
        actorType: AuditActor.USER,
      });
      auditLogRepository.create.mockReturnValue(entity);
      auditLogRepository.save.mockResolvedValue(entity);

      const result = await service.record({
        action: AuditAction.CREATE,
        entityType: AuditEntityType.USER,
        entityId: 7,
        performedBy: 7,
        actorType: AuditActor.USER,
      });

      expect(result.performedBy).toBe(7);
      expect(result.actorType).toBe(AuditActor.USER);
    });

    it('records SYSTEM actions with performedBy null', async () => {
      const entity = mockSystemAuditLogEntity({
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TICKET,
        entityId: 9,
      });
      auditLogRepository.create.mockReturnValue(entity);
      auditLogRepository.save.mockResolvedValue(entity);

      const result = await service.record({
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TICKET,
        entityId: 9,
        performedBy: null,
        actorType: AuditActor.SYSTEM,
        details: { previousPriority: 'LOW', newPriority: 'MEDIUM' },
      });

      expect(result.performedBy).toBeNull();
      expect(result.actorType).toBe(AuditActor.SYSTEM);
    });

    it('does not update or delete existing audit rows (append-only)', async () => {
      const entity = mockAuditLogEntity();
      auditLogRepository.create.mockReturnValue(entity);
      auditLogRepository.save.mockResolvedValue(entity);

      await service.record({
        action: AuditAction.DELETE,
        entityType: AuditEntityType.COMMENT,
        entityId: 1,
        performedBy: 2,
        actorType: AuditActor.USER,
      });

      expect(auditLogRepository.update).not.toHaveBeenCalled();
      expect(auditLogRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('findAll (filtering and ordering)', () => {
    const older = mockAuditLogEntity({
      id: 1,
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    });
    const newer = mockAuditLogEntity({
      id: 2,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
    });

    it('returns all logs ordered newest first when no filters', async () => {
      auditLogRepository.find.mockResolvedValue([newer, older]);

      const result = await service.findAll({});

      expect(auditLogRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
    });

    it('filters by entityType', async () => {
      auditLogRepository.find.mockResolvedValue([newer]);

      await service.findAll({ entityType: AuditEntityType.PROJECT });

      expect(auditLogRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: AuditEntityType.PROJECT,
          }),
        }),
      );
    });

    it('filters by entityId', async () => {
      auditLogRepository.find.mockResolvedValue([newer]);

      await service.findAll({ entityId: 42 });

      expect(auditLogRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityId: 42 }),
        }),
      );
    });

    it('filters by action', async () => {
      auditLogRepository.find.mockResolvedValue([newer]);

      await service.findAll({ action: AuditAction.DELETE });

      expect(auditLogRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: AuditAction.DELETE }),
        }),
      );
    });

    it('filters by performedBy', async () => {
      auditLogRepository.find.mockResolvedValue([newer]);

      await service.findAll({ performedBy: 3 });

      expect(auditLogRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ performedBy: 3 }),
        }),
      );
    });

    it('supports combined filters (entityType, entityId, action, performedBy)', async () => {
      auditLogRepository.find.mockResolvedValue([newer]);
      const query: AuditLogQueryDto = {
        entityType: AuditEntityType.TICKET,
        entityId: 5,
        action: AuditAction.UPDATE,
        performedBy: 2,
      };

      await service.findAll(query);

      expect(auditLogRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: AuditEntityType.TICKET,
            entityId: 5,
            action: AuditAction.UPDATE,
            performedBy: 2,
          }),
        }),
      );
    });

    it('returns empty array when no logs match', async () => {
      auditLogRepository.find.mockResolvedValue([]);

      const result = await service.findAll({ entityId: 9999 });

      expect(result).toEqual([]);
    });
  });

  describe('buildTicketStateHistory (projection)', () => {
    it('loads all TICKET audit logs for ticketId ordered ascending by createdAt', async () => {
      auditLogRepository.find.mockResolvedValue([
        mockAuditLogEntity({ id: 1, entityId: 10 }),
      ]);

      await service.buildTicketStateHistory(10);

      expect(auditLogRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: AuditEntityType.TICKET, entityId: 10 },
          order: { createdAt: 'ASC' },
        }),
      );
    });

    it('projects every matching audit log entry without requiring from/to', async () => {
      const createEntry = mockAuditLogEntity({
        id: 1,
        action: AuditAction.CREATE,
        entityId: 10,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        details: { title: 'New ticket', status: TicketStatus.TODO },
      });
      const titleUpdate = mockAuditLogEntity({
        id: 2,
        action: AuditAction.UPDATE,
        entityId: 10,
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
        details: { title: { before: 'A', after: 'B' } },
      });
      const statusUpdate = mockAuditLogEntity({
        id: 3,
        action: AuditAction.UPDATE,
        entityId: 10,
        createdAt: new Date('2026-01-03T10:00:00.000Z'),
        details: {
          from: TicketStatus.TODO,
          to: TicketStatus.IN_PROGRESS,
        },
      });
      auditLogRepository.find.mockResolvedValue([
        createEntry,
        titleUpdate,
        statusUpdate,
      ]);

      const history = await service.buildTicketStateHistory(10);

      expect(history).toHaveLength(3);
      expect(history[0]).toMatchObject({
        id: 1,
        action: AuditAction.CREATE,
        details: createEntry.details,
      });
      expect(history[1]).toMatchObject({
        id: 2,
        action: AuditAction.UPDATE,
        details: titleUpdate.details,
      });
      expect(history[2]).toMatchObject({
        id: 3,
        action: AuditAction.UPDATE,
        details: statusUpdate.details,
      });
    });

    it('orders stateHistory ascending by createdAt', async () => {
      auditLogRepository.find.mockResolvedValue([
        mockAuditLogEntity({
          id: 2,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
        mockAuditLogEntity({
          id: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ]);

      const history = await service.buildTicketStateHistory(1);

      expect(history[0].id).toBe(1);
      expect(history[1].id).toBe(2);
    });

    it('exposes projection fields without entityType or entityId on each entry', async () => {
      auditLogRepository.find.mockResolvedValue([mockAuditLogEntity({ id: 5 })]);

      const history = await service.buildTicketStateHistory(5);

      expect(history[0]).toMatchObject({
        id: 5,
        action: AuditAction.CREATE,
        performedBy: 2,
        actorType: AuditActor.USER,
        details: expect.any(Object),
      });
      expect(history[0]).not.toHaveProperty('entityType');
      expect(history[0]).not.toHaveProperty('entityId');
      expect(history[0].createdAt).toBeInstanceOf(Date);
    });

    it('returns empty stateHistory when ticket has no audit logs', async () => {
      auditLogRepository.find.mockResolvedValue([]);

      const history = await service.buildTicketStateHistory(99);

      expect(history).toEqual([]);
    });
  });
});
