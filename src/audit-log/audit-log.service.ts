import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import {
  AuditLogResponse,
  toAuditLogResponse,
  toTicketStateHistoryEntry,
} from './audit-log.mapper';
import { RecordAuditLogInput, TicketStateHistoryEntry } from './audit-log.types';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async record(
    input: RecordAuditLogInput,
    manager?: EntityManager,
  ): Promise<AuditLogResponse> {
    const repository = manager
      ? manager.getRepository(AuditLog)
      : this.auditLogRepository;

    const entity = repository.create({
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      performedBy: input.performedBy,
      actorType: input.actorType,
      details: input.details ?? null,
    });
    const saved = await repository.save(entity);
    return toAuditLogResponse(saved);
  }

  async findAll(query: AuditLogQueryDto): Promise<AuditLogResponse[]> {
    const where = this.buildWhere(query);
    const logs = await this.auditLogRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return logs.map(toAuditLogResponse);
  }

  async buildTicketStateHistory(
    ticketId: number,
  ): Promise<TicketStateHistoryEntry[]> {
    const logs = await this.auditLogRepository.find({
      where: {
        entityType: AuditEntityType.TICKET,
        entityId: ticketId,
      },
      order: { createdAt: 'ASC' },
    });

    return logs
      .map(toTicketStateHistoryEntry)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
  }

  private buildWhere(query: AuditLogQueryDto): FindOptionsWhere<AuditLog> {
    const where: FindOptionsWhere<AuditLog> = {};

    if (query.entityType !== undefined) {
      where.entityType = query.entityType;
    }
    if (query.entityId !== undefined) {
      where.entityId = query.entityId;
    }
    if (query.action !== undefined) {
      where.action = query.action;
    }
    if (query.actor !== undefined) {
      where.actorType = query.actor;
    }
    if (query.performedBy !== undefined) {
      where.performedBy = query.performedBy;
    }

    return where;
  }
}
