import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditActor } from '../../common/enums/audit-actor.enum';
import { AuditEntityType } from '../../common/enums/audit-entity-type.enum';

export class AuditLogQueryDto {
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @IsOptional()
  @IsInt()
  @Min(1)
  entityId?: number;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  /** README query param; maps to actorType in persistence. */
  @IsOptional()
  @IsEnum(AuditActor)
  actor?: AuditActor;

  @IsOptional()
  @IsInt()
  @Min(1)
  performedBy?: number;
}
