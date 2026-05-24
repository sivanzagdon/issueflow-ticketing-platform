import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity('ticket_dependencies')
@Unique('ticket_dependencies_ticket_blocker_key', ['ticketId', 'blockerId'])
export class TicketDependency {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'ticket_id' })
  ticketId: number;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @Index()
  @Column({ name: 'blocker_id' })
  blockerId: number;

  @ManyToOne(() => Ticket)
  @JoinColumn({ name: 'blocker_id' })
  blocker: Ticket;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
