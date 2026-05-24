import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { mockAuditLogEntity } from './testing/audit-log.fixtures';

/**
 * Regression: audit writes must use the active EntityManager repository when
 * domain services pass `record(input, manager)` inside dataSource.transaction.
 *
 * Without manager.getRepository(AuditLog), audit inserts escape the transaction
 * and cannot roll back with the domain mutation.
 */
describe('AuditLogService transactional repository selection (regression)', () => {
  let service: AuditLogService;
  let defaultRepository: jest.Mocked<Pick<Repository<AuditLog>, 'create' | 'save'>>;
  let transactionalRepository: jest.Mocked<
    Pick<Repository<AuditLog>, 'create' | 'save'>
  >;
  let manager: EntityManager;

  const recordInput = {
    action: AuditAction.UPDATE,
    entityType: AuditEntityType.TICKET,
    entityId: 12,
    performedBy: 3,
    actorType: AuditActor.USER,
    details: { from: 'TODO', to: 'IN_PROGRESS' },
  } as const;

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

  describe('when EntityManager is provided', () => {
    beforeEach(() => {
      defaultRepository.create.mockImplementation(() => {
        throw new Error('default repository must not be used when manager is provided');
      });
      defaultRepository.save.mockImplementation(() => {
        throw new Error('default repository must not be used when manager is provided');
      });
    });

    it('resolves AuditLog repository through manager.getRepository(AuditLog)', async () => {
      const entity = mockAuditLogEntity({ id: 50 });
      transactionalRepository.create.mockReturnValue(entity);
      transactionalRepository.save.mockResolvedValue(entity);

      await service.record(recordInput, manager);

      expect(manager.getRepository).toHaveBeenCalledTimes(1);
      expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
    });

    it('creates and saves only through the manager repository', async () => {
      const entity = mockAuditLogEntity({ id: 51 });
      transactionalRepository.create.mockReturnValue(entity);
      transactionalRepository.save.mockResolvedValue(entity);

      await service.record(recordInput, manager);

      expect(transactionalRepository.create).toHaveBeenCalledTimes(1);
      expect(transactionalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: recordInput.action,
          entityType: recordInput.entityType,
          entityId: recordInput.entityId,
          performedBy: recordInput.performedBy,
          actorType: recordInput.actorType,
          details: recordInput.details,
        }),
      );
      expect(transactionalRepository.save).toHaveBeenCalledTimes(1);
      expect(transactionalRepository.save).toHaveBeenCalledWith(entity);
    });

    it('does not invoke default repository create or save', async () => {
      const entity = mockAuditLogEntity({ id: 52 });
      transactionalRepository.create.mockReturnValue(entity);
      transactionalRepository.save.mockResolvedValue(entity);

      await service.record(recordInput, manager);

      expect(defaultRepository.create).not.toHaveBeenCalled();
      expect(defaultRepository.save).not.toHaveBeenCalled();
    });

    it('calls save exactly once on the transactional repository (no duplicate writes)', async () => {
      const entity = mockAuditLogEntity({ id: 53 });
      transactionalRepository.create.mockReturnValue(entity);
      transactionalRepository.save.mockResolvedValue(entity);

      await service.record(recordInput, manager);

      expect(transactionalRepository.save).toHaveBeenCalledTimes(1);
      expect(defaultRepository.save).not.toHaveBeenCalled();
    });

    it('resolves repository via manager before create and save', async () => {
      const callOrder: string[] = [];
      (manager.getRepository as jest.Mock).mockImplementation((entity) => {
        callOrder.push('getRepository');
        expect(entity).toBe(AuditLog);
        return transactionalRepository;
      });
      transactionalRepository.create.mockImplementation(() => {
        callOrder.push('create');
        return mockAuditLogEntity({ id: 54 });
      });
      transactionalRepository.save.mockImplementation(async (input) => {
        callOrder.push('save');
        return input as AuditLog;
      });

      await service.record(recordInput, manager);

      expect(callOrder).toEqual(['getRepository', 'create', 'save']);
    });
  });

  describe('when EntityManager is omitted', () => {
    beforeEach(() => {
      (manager.getRepository as jest.Mock).mockImplementation(() => {
        throw new Error('manager.getRepository must not be called without manager');
      });
    });

    it('uses the injected default repository for create and save', async () => {
      const entity = mockAuditLogEntity({ id: 60 });
      defaultRepository.create.mockReturnValue(entity);
      defaultRepository.save.mockResolvedValue(entity);

      await service.record(recordInput);

      expect(manager.getRepository).not.toHaveBeenCalled();
      expect(defaultRepository.create).toHaveBeenCalledTimes(1);
      expect(defaultRepository.save).toHaveBeenCalledTimes(1);
      expect(defaultRepository.save).toHaveBeenCalledWith(entity);
    });

    it('does not touch the transactional repository when manager is omitted', async () => {
      const entity = mockAuditLogEntity({ id: 61 });
      defaultRepository.create.mockReturnValue(entity);
      defaultRepository.save.mockResolvedValue(entity);

      await service.record(recordInput);

      expect(transactionalRepository.create).not.toHaveBeenCalled();
      expect(transactionalRepository.save).not.toHaveBeenCalled();
    });

    it('calls default repository save exactly once (no duplicate writes)', async () => {
      const entity = mockAuditLogEntity({ id: 62 });
      defaultRepository.create.mockReturnValue(entity);
      defaultRepository.save.mockResolvedValue(entity);

      await service.record(recordInput);

      expect(defaultRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
