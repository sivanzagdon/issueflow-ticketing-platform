import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { mockAuditLogEntity } from './testing/audit-log.fixtures';

describe('AuditLogService (append-only)', () => {
  let service: AuditLogService;
  let repository: jest.Mocked<
    Pick<Repository<AuditLog>, 'create' | 'save' | 'update' | 'delete'>
  >;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<Repository<AuditLog>, 'create' | 'save' | 'update' | 'delete'>
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: repository },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  it('does not expose update or delete methods on the service', () => {
    expect(service).not.toHaveProperty('update');
    expect(service).not.toHaveProperty('remove');
    expect(service).not.toHaveProperty('delete');
  });

  it('never calls repository.update or repository.delete when recording', async () => {
    const entity = mockAuditLogEntity();
    repository.create.mockReturnValue(entity);
    repository.save.mockResolvedValue(entity);

    await service.record({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.TICKET,
      entityId: 1,
      performedBy: 2,
      actorType: AuditActor.USER,
      details: { from: 'TODO', to: 'IN_PROGRESS' },
    });

    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('creates a new row on each record call instead of mutating prior rows', async () => {
    const first = mockAuditLogEntity({ id: 1, details: { version: 1 } });
    const second = mockAuditLogEntity({ id: 2, details: { version: 2 } });
    repository.create
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    repository.save.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await service.record({
      action: AuditAction.CREATE,
      entityType: AuditEntityType.TICKET,
      entityId: 10,
      performedBy: 2,
      actorType: AuditActor.USER,
      details: { version: 1 },
    });
    await service.record({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.TICKET,
      entityId: 10,
      performedBy: 2,
      actorType: AuditActor.USER,
      details: { version: 2 },
    });

    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.save).toHaveBeenNthCalledWith(1, first);
    expect(repository.save).toHaveBeenNthCalledWith(2, second);
    expect(first.details).toEqual({ version: 1 });
  });
});
