import { Injectable } from '@nestjs/common';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogResponse } from './audit-log.mapper';
import { RecordAuditLogInput, TicketStateHistoryEntry } from './audit-log.types';

/**
 * Slice 8 — implementation pending. Tests define expected behavior.
 */
@Injectable()
export class AuditLogService {
  async record(_input: RecordAuditLogInput): Promise<AuditLogResponse> {
    throw new Error('Not implemented');
  }

  async findAll(_query: AuditLogQueryDto): Promise<AuditLogResponse[]> {
    throw new Error('Not implemented');
  }

  async buildTicketStateHistory(
    _ticketId: number,
  ): Promise<TicketStateHistoryEntry[]> {
    throw new Error('Not implemented');
  }
}
