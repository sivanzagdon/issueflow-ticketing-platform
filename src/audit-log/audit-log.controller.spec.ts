import { CanActivate, ExecutionContext, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { mockAuditLogResponse } from './testing/audit-log.fixtures';

const mockJwtAuthGuard: CanActivate = {
  canActivate: (_context: ExecutionContext) => true,
};

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    auditLogService = {
      record: jest.fn(),
      findAll: jest.fn(),
      buildTicketStateHistory: jest.fn(),
    } as unknown as jest.Mocked<AuditLogService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [{ provide: AuditLogService, useValue: auditLogService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get(AuditLogController);
  });

  it('applies JwtAuthGuard to audit log routes', () => {
    const guards = Reflect.getMetadata('__guards__', AuditLogController);
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  it('exposes only GET /audit-logs (no POST handler)', () => {
    const findAllMethod = Reflect.getMetadata(
      METHOD_METADATA,
      AuditLogController.prototype.findAll,
    );
    const findAllPath = Reflect.getMetadata(
      PATH_METADATA,
      AuditLogController.prototype.findAll,
    );
    expect(findAllMethod).toBe(RequestMethod.GET);
    expect(findAllPath).toBe('/');

    expect(
      (AuditLogController.prototype as { create?: unknown }).create,
    ).toBeUndefined();
    expect(
      (AuditLogController.prototype as { remove?: unknown }).remove,
    ).toBeUndefined();
  });

  it('GET findAll uses controller path audit-logs', () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, AuditLogController);
    expect(controllerPath).toBe('audit-logs');
  });

  it('delegates findAll to AuditLogService with query DTO', async () => {
    const query: AuditLogQueryDto = {
      entityType: AuditEntityType.TICKET,
      entityId: 5,
      action: AuditAction.UPDATE,
      performedBy: 2,
    };
    const logs = [mockAuditLogResponse()];
    auditLogService.findAll.mockResolvedValue(logs);

    const result = await controller.findAll(query);

    expect(auditLogService.findAll).toHaveBeenCalledWith(query);
    expect(result).toEqual(logs);
  });
});
