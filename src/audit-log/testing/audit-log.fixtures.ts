import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditActor } from '../../common/enums/audit-actor.enum';
import { AuditEntityType } from '../../common/enums/audit-entity-type.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { AuditLogResponse, toAuditLogResponse } from '../audit-log.mapper';
import { AuditLog } from '../entities/audit-log.entity';

export const mockAuditLogEntity = (
  overrides: Partial<AuditLog> = {},
): AuditLog => ({
  id: 1,
  action: AuditAction.CREATE,
  entityType: AuditEntityType.TICKET,
  entityId: 5,
  performedBy: 2,
  actorType: AuditActor.USER,
  details: { title: 'Sample', status: TicketStatus.TODO },
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  ...overrides,
});

export const mockAuditLogResponse = (
  overrides: Partial<AuditLogResponse> = {},
): AuditLogResponse => ({
  ...toAuditLogResponse(mockAuditLogEntity()),
  ...overrides,
});

export const mockSystemAuditLogEntity = (
  overrides: Partial<AuditLog> = {},
): AuditLog =>
  mockAuditLogEntity({
    performedBy: null,
    actorType: AuditActor.SYSTEM,
    details: { assignedTo: 3, reason: 'least workload' },
    ...overrides,
  });
