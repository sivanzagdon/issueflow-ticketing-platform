import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { AuditLogResponse } from './audit-log.mapper';

export type AuditLogDetails = Record<string, unknown>;

export interface RecordAuditLogInput {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: number;
  performedBy: number | null;
  actorType: AuditActor;
  details?: AuditLogDetails | null;
}

/** Derived projection from audit_logs; not persisted on Ticket. */
export type TicketStateHistoryEntry = Pick<
  AuditLogResponse,
  'id' | 'action' | 'performedBy' | 'actorType' | 'createdAt' | 'details'
>;
