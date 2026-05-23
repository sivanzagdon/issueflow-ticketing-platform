import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { mockAuditLogEntity, mockSystemAuditLogEntity } from './testing/audit-log.fixtures';
import { bindRecordWithManager } from './testing/transaction-test.helpers';

describe('AuditLogService (transactional record)', () => {
  let service: AuditLogService;
  let defaultRepository: jest.Mocked<Pick<Repository<AuditLog>, 'create' | 'save'>>;
  let transactionalRepository: jest.Mocked<
    Pick<Repository<AuditLog>, 'create' | 'save'>
  >;
  let manager: EntityManager;

  beforeEach(async () => {
    defaultRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<AuditLog>, 'create' | 'save'>>;

    transactionalRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<AuditLog>, 'create' | 'save'>>;

    manager = {
      getRepository: jest.fn().mockReturnValue(transactionalRepository),
    } as unknown as EntityManager;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: defaultRepository },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  it('uses the injected repository when EntityManager is omitted', async () => {
    const entity = mockAuditLogEntity();
    defaultRepository.create.mockReturnValue(entity);
    defaultRepository.save.mockResolvedValue(entity);

    await service.record({
      action: AuditAction.CREATE,
      entityType: AuditEntityType.USER,
      entityId: 1,
      performedBy: 1,
      actorType: AuditActor.USER,
    });

    expect(defaultRepository.create).toHaveBeenCalled();
    expect(defaultRepository.save).toHaveBeenCalledWith(entity);
    expect(manager.getRepository).not.toHaveBeenCalled();
  });

  it('uses manager.getRepository(AuditLog) when EntityManager is provided', async () => {
    const entity = mockAuditLogEntity({ id: 99 });
    transactionalRepository.create.mockReturnValue(entity);
    transactionalRepository.save.mockResolvedValue(entity);
    const record = bindRecordWithManager(service);

    await record(
      {
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TICKET,
        entityId: 5,
        performedBy: 2,
        actorType: AuditActor.USER,
        details: { from: 'TODO', to: 'IN_PROGRESS' },
      },
      manager,
    );

    expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
    expect(transactionalRepository.create).toHaveBeenCalled();
    expect(transactionalRepository.save).toHaveBeenCalledWith(entity);
    expect(defaultRepository.save).not.toHaveBeenCalled();
  });

  it('supports SYSTEM actor with performedBy null', async () => {
    const entity = mockSystemAuditLogEntity({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.TICKET,
      entityId: 9,
    });
    defaultRepository.create.mockReturnValue(entity);
    defaultRepository.save.mockResolvedValue(entity);

    const result = await service.record({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.TICKET,
      entityId: 9,
      performedBy: null,
      actorType: AuditActor.SYSTEM,
      details: { assignedTo: 3, reason: 'lowest_workload' },
    });

    expect(defaultRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        performedBy: null,
        actorType: AuditActor.SYSTEM,
      }),
    );
    const apiResult = result as Record<string, unknown>;
    expect(apiResult.performedBy).toBeNull();
    expect(apiResult.actor).toBe(AuditActor.SYSTEM);
    expect(apiResult.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
