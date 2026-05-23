import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { mockAuditLogEntity } from './testing/audit-log.fixtures';

describe('AuditLogService (GET /audit-logs filter contract)', () => {
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

  const expectWhere = async (
    query: Record<string, unknown>,
    expectedWhere: Record<string, unknown>,
  ) => {
    repository.find.mockResolvedValue([mockAuditLogEntity()]);
    await service.findAll(query as never);
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(expectedWhere),
        order: { createdAt: 'DESC' },
      }),
    );
  };

  it('filters by entityType', async () => {
    await expectWhere(
      { entityType: AuditEntityType.PROJECT },
      { entityType: AuditEntityType.PROJECT },
    );
  });

  it('filters by entityId', async () => {
    await expectWhere({ entityId: 42 }, { entityId: 42 });
  });

  it('filters by action', async () => {
    await expectWhere({ action: AuditAction.DELETE }, { action: AuditAction.DELETE });
  });

  it('filters by actor (README query param) mapped to actorType column', async () => {
    await expectWhere({ actor: AuditActor.SYSTEM }, { actorType: AuditActor.SYSTEM });
  });

  it('filters by performedBy for backward compatibility', async () => {
    await expectWhere({ performedBy: 7 }, { performedBy: 7 });
  });

  it('supports combined entityType, entityId, action, actor, and performedBy', async () => {
    repository.find.mockResolvedValue([]);
    await service.findAll({
      entityType: AuditEntityType.TICKET,
      entityId: 5,
      action: AuditAction.UPDATE,
      actor: AuditActor.USER,
      performedBy: 2,
    } as never);

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityType: AuditEntityType.TICKET,
          entityId: 5,
          action: AuditAction.UPDATE,
          actorType: AuditActor.USER,
          performedBy: 2,
        },
      }),
    );
  });
});
