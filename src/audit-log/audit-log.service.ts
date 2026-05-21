import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
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

  async record(input: RecordAuditLogInput): Promise<AuditLogResponse> {
    const entity = this.auditLogRepository.create({
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      performedBy: input.performedBy,
      actorType: input.actorType,
      details: input.details ?? null,
    });
    const saved = await this.auditLogRepository.save(entity);
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
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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
    if (query.performedBy !== undefined) {
      where.performedBy = query.performedBy;
    }

    return where;
  }
}
