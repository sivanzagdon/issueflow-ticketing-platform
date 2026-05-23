import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketStateHistoryEntry } from './audit-log.types';
import { AuditLog } from './entities/audit-log.entity';

/** Public API shape for GET /audit-logs (README contract). */
export type AuditLogResponse = {
  id: number;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: number;
  performedBy: number | null;
  actor: AuditActor;
  timestamp: string;
  details: Record<string, unknown> | null;
};

export function toAuditLogResponse(log: AuditLog): AuditLogResponse {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    performedBy: log.performedBy,
    actor: log.actorType,
    timestamp: log.createdAt.toISOString(),
    details: log.details,
  };
}

export function toTicketStateHistoryEntry(
  log: AuditLog,
): TicketStateHistoryEntry {
  const response = toAuditLogResponse(log);
  return {
    id: response.id,
    action: response.action,
    performedBy: response.performedBy,
    actor: response.actor,
    timestamp: response.timestamp,
    details: response.details,
  };
}
