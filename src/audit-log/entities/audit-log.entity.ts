import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditActor } from '../../common/enums/audit-actor.enum';
import { AuditEntityType } from '../../common/enums/audit-entity-type.enum';

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ name: 'entity_type', type: 'enum', enum: AuditEntityType })
  entityType: AuditEntityType;

  @Column({ name: 'entity_id' })
  entityId: number;

  @Column({ name: 'performed_by', nullable: true })
  performedBy: number | null;

  @Column({ type: 'enum', enum: AuditActor })
  actor: AuditActor;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;
}
