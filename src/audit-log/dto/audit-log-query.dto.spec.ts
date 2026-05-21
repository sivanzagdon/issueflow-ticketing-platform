import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditEntityType } from '../../common/enums/audit-entity-type.enum';
import { AuditLogQueryDto } from './audit-log-query.dto';

describe('AuditLogQueryDto', () => {
  const validateDto = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(AuditLogQueryDto, payload);
    return validate(dto);
  };

  it('accepts empty query (all filters optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('accepts valid combined filters', async () => {
    const errors = await validateDto({
      entityType: AuditEntityType.TICKET,
      entityId: 5,
      action: AuditAction.UPDATE,
      performedBy: 2,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid entityType', async () => {
    const errors = await validateDto({ entityType: 'INVALID' });
    expect(errors.some((e) => e.property === 'entityType')).toBe(true);
  });

  it('rejects invalid entityId', async () => {
    const errors = await validateDto({ entityId: 0 });
    expect(errors.some((e) => e.property === 'entityId')).toBe(true);
  });

  it('rejects invalid action', async () => {
    const errors = await validateDto({ action: 'INVALID' });
    expect(errors.some((e) => e.property === 'action')).toBe(true);
  });

  it('rejects invalid performedBy', async () => {
    const errors = await validateDto({ performedBy: 0 });
    expect(errors.some((e) => e.property === 'performedBy')).toBe(true);
  });

  it('rejects actorType query param (not supported as filter)', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    await expect(
      pipe.transform(
        { entityType: AuditEntityType.TICKET, actorType: 'USER' },
        { type: 'query', metatype: AuditLogQueryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown fields when validated through global ValidationPipe settings', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    await expect(
      pipe.transform(
        { entityType: AuditEntityType.USER, extra: true },
        { type: 'query', metatype: AuditLogQueryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
