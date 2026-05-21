import { TicketStateHistoryEntry } from './audit-log.types';
import { AuditLog } from './entities/audit-log.entity';

export type AuditLogResponse = Pick<
  AuditLog,
  | 'id'
  | 'action'
  | 'entityType'
  | 'entityId'
  | 'performedBy'
  | 'actorType'
  | 'createdAt'
  | 'details'
>;

export function toAuditLogResponse(log: AuditLog): AuditLogResponse {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    performedBy: log.performedBy,
    actorType: log.actorType,
    createdAt: log.createdAt,
    details: log.details,
  };
}

export function toTicketStateHistoryEntry(
  log: AuditLog,
): TicketStateHistoryEntry {
  return {
    id: log.id,
    action: log.action,
    performedBy: log.performedBy,
    actorType: log.actorType,
    createdAt: log.createdAt,
    details: log.details,
  };
}
