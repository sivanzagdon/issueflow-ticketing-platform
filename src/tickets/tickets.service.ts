import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketAttachment } from './entities/ticket-attachment.entity';
import { TicketDependency } from './entities/ticket-dependency.entity';
import { Ticket } from './entities/ticket.entity';
import {
  TicketImportCsvRow,
  exportTicketsToCsv,
  isTicketPriorityValue,
  isTicketStatusValue,
  isTicketTypeValue,
  parseTicketImportCsv,
} from './ticket-csv';
import { TicketImportResult } from './ticket-csv';
import {
  TicketAttachmentResponse,
  TicketBlockerSummary,
  TicketDetailResponse,
  TicketResponse,
  toAttachmentResponse,
  toTicketResponse,
} from './tickets.mapper';

const STATUS_ORDER: TicketStatus[] = [
  TicketStatus.TODO,
  TicketStatus.IN_PROGRESS,
  TicketStatus.IN_REVIEW,
  TicketStatus.DONE,
];

function assertOneStepForward(from: TicketStatus, to: TicketStatus): void {
  const fromIdx = STATUS_ORDER.indexOf(from);
  const toIdx = STATUS_ORDER.indexOf(to);
  if (toIdx !== fromIdx + 1) {
    throw new BadRequestException('Invalid status transition');
  }
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketDependency)
    private readonly ticketDependencyRepository: Repository<TicketDependency>,
    @InjectRepository(TicketAttachment)
    private readonly ticketAttachmentRepository: Repository<TicketAttachment>,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    createTicketDto: CreateTicketDto,
    performedBy?: number,
  ): Promise<TicketResponse> {
    await this.projectsService.findOne(createTicketDto.projectId);

    if (createTicketDto.assigneeId != null) {
      await this.usersService.findOne(createTicketDto.assigneeId);
    }

    return this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);
      const ticket = ticketRepo.create({
        title: createTicketDto.title,
        description: createTicketDto.description ?? null,
        status: createTicketDto.status,
        priority: createTicketDto.priority,
        type: createTicketDto.type,
        projectId: createTicketDto.projectId,
        assigneeId: createTicketDto.assigneeId ?? null,
        dueDate: createTicketDto.dueDate
          ? new Date(createTicketDto.dueDate)
          : null,
      });

      const saved = await ticketRepo.save(ticket);

      await this.auditLogService.record(
        {
          action: AuditAction.CREATE,
          entityType: AuditEntityType.TICKET,
          entityId: saved.id,
          performedBy:
            performedBy ??
            createTicketDto.assigneeId ??
            createTicketDto.projectId,
          actorType: AuditActor.USER,
          details: {
            title: saved.title,
            status: saved.status,
            priority: saved.priority,
            type: saved.type,
            projectId: saved.projectId,
            assigneeId: saved.assigneeId,
          },
        },
        manager,
      );

      return toTicketResponse(saved);
    });
  }

  async findAll(projectId: number): Promise<TicketResponse[]> {
    const tickets = await this.ticketRepository.find({
      where: { projectId },
    });
    return tickets.map(toTicketResponse);
  }

  async findOne(id: number): Promise<TicketDetailResponse> {
    const ticket = await this.getTicketOrThrow(id);
    const stateHistory =
      await this.auditLogService.buildTicketStateHistory(id);
    return {
      ...toTicketResponse(ticket),
      stateHistory,
    };
  }

  async update(
    id: number,
    updateTicketDto: UpdateTicketDto,
    performedBy?: number,
  ): Promise<TicketResponse> {
    const ticket = await this.getTicketOrThrow(id);
    const beforeStatus = ticket.status;

    if (ticket.status === TicketStatus.DONE) {
      throw new BadRequestException('Cannot update a completed ticket');
    }

    if (updateTicketDto.version !== ticket.version) {
      throw new ConflictException('Ticket version conflict');
    }

    if (updateTicketDto.assigneeId !== undefined) {
      await this.usersService.findOne(updateTicketDto.assigneeId);
      ticket.assigneeId = updateTicketDto.assigneeId;
    }

    if (
      updateTicketDto.status !== undefined &&
      updateTicketDto.status !== ticket.status
    ) {
      assertOneStepForward(ticket.status, updateTicketDto.status);
      ticket.status = updateTicketDto.status;
    }

    if (updateTicketDto.title !== undefined) {
      ticket.title = updateTicketDto.title;
    }
    if (updateTicketDto.description !== undefined) {
      ticket.description = updateTicketDto.description;
    }
    if (updateTicketDto.priority !== undefined) {
      ticket.priority = updateTicketDto.priority;
    }
    if (updateTicketDto.dueDate !== undefined) {
      ticket.dueDate = updateTicketDto.dueDate
        ? new Date(updateTicketDto.dueDate)
        : null;
    }

    return this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);

      if (
        updateTicketDto.status === TicketStatus.DONE &&
        beforeStatus !== TicketStatus.DONE
      ) {
        await this.assertNoUnresolvedBlockers(
          manager.getRepository(TicketDependency),
          id,
        );
      }

      const saved = await ticketRepo.save(ticket);
      const details = this.buildTicketUpdateDetails(
        beforeStatus,
        updateTicketDto,
        saved,
      );

      await this.auditLogService.record(
        {
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.TICKET,
          entityId: saved.id,
          performedBy: performedBy ?? saved.assigneeId ?? saved.projectId,
          actorType: AuditActor.USER,
          details: Object.keys(details).length > 0 ? details : null,
        },
        manager,
      );

      return toTicketResponse(saved);
    });
  }

  async findAllDeleted(projectId: number): Promise<TicketResponse[]> {
    const tickets = await this.ticketRepository.find({
      where: { projectId, deletedAt: Not(IsNull()) },
      withDeleted: true,
    });
    return tickets.map(toTicketResponse);
  }

  async restore(id: number, performedBy?: number): Promise<TicketResponse> {
    return this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);
      const ticket = await ticketRepo.findOne({
        where: { id },
        withDeleted: true,
      });
      if (!ticket || ticket.deletedAt == null) {
        throw new NotFoundException(`Ticket ${id} not found`);
      }

      const deletedAt = ticket.deletedAt;
      await ticketRepo.restore({ id });
      const restored = await ticketRepo.findOne({ where: { id } });
      if (!restored) {
        throw new NotFoundException(`Ticket ${id} not found`);
      }

      await this.auditLogService.record(
        {
          action: AuditAction.RESTORE,
          entityType: AuditEntityType.TICKET,
          entityId: id,
          performedBy: performedBy ?? ticket.assigneeId ?? ticket.projectId,
          actorType: AuditActor.USER,
          details: {
            before: { deletedAt: deletedAt.toISOString() },
            after: { deletedAt: null },
          },
        },
        manager,
      );

      return toTicketResponse(restored);
    });
  }

  async addDependency(
    ticketId: number,
    blockedBy: number,
    performedBy?: number,
  ): Promise<void> {
    if (ticketId === blockedBy) {
      throw new BadRequestException('Ticket cannot depend on itself');
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const ticketRepo = manager.getRepository(Ticket);
        const dependencyRepo = manager.getRepository(TicketDependency);

        const ticket = await ticketRepo.findOne({ where: { id: ticketId } });
        this.assertActiveTicketForDependency(ticket, ticketId);

        const blocker = await ticketRepo.findOne({ where: { id: blockedBy } });
        this.assertActiveTicketForDependency(blocker, blockedBy);
        this.assertSameProjectForDependency(ticket, blocker);

        const dependency = dependencyRepo.create({ ticketId, blockerId: blockedBy });
        const saved = await dependencyRepo.save(dependency);

        await this.auditLogService.record(
          {
            action: AuditAction.CREATE,
            entityType: AuditEntityType.TICKET_DEPENDENCY,
            entityId: saved.id,
            performedBy: performedBy ?? ticket!.assigneeId ?? ticket!.projectId,
            actorType: AuditActor.USER,
            details: { ticketId, blockedBy },
          },
          manager,
        );
      });
    } catch (error) {
      this.rethrowDependencyPersistenceError(error);
    }
  }

  async getDependencies(ticketId: number): Promise<TicketBlockerSummary[]> {
    await this.getTicketOrThrow(ticketId);

    const dependencies = await this.ticketDependencyRepository.find({
      where: {
        ticketId,
        blocker: { deletedAt: IsNull() },
      },
      relations: ['blocker'],
    });

    return this.toBlockerSummaries(dependencies);
  }

  async createAttachment(
    ticketId: number,
    file: Express.Multer.File,
    performedBy?: number,
  ): Promise<TicketAttachmentResponse> {
    return this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);
      const attachmentRepo = manager.getRepository(TicketAttachment);

      const ticket = await ticketRepo.findOne({
        where: { id: ticketId },
        withDeleted: true,
      });
      this.assertActiveTicketForAttachment(ticket, ticketId);

      const attachment = attachmentRepo.create({
        ticketId,
        filename: file.originalname,
        contentType: file.mimetype,
      });
      const saved = await attachmentRepo.save(attachment);

      await this.auditLogService.record(
        {
          action: AuditAction.CREATE,
          entityType: AuditEntityType.TICKET_ATTACHMENT,
          entityId: saved.id,
          performedBy: performedBy ?? ticket.assigneeId ?? ticket.projectId,
          actorType: AuditActor.USER,
          details: {
            ticketId,
            attachmentId: saved.id,
            filename: saved.filename,
          },
        },
        manager,
      );

      return toAttachmentResponse(saved);
    });
  }

  async getAttachments(ticketId: number): Promise<TicketAttachmentResponse[]> {
    await this.getTicketOrThrow(ticketId);

    const attachments = await this.ticketAttachmentRepository.find({
      where: { ticketId, deletedAt: IsNull() },
      order: { id: 'ASC' },
    });

    return attachments
      .map(toAttachmentResponse)
      .sort((a, b) => a.id - b.id);
  }

  async removeAttachment(
    ticketId: number,
    attachmentId: number,
    performedBy?: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);
      const attachmentRepo = manager.getRepository(TicketAttachment);

      const ticket = await ticketRepo.findOne({
        where: { id: ticketId },
        withDeleted: true,
      });
      this.assertActiveTicketForAttachment(ticket, ticketId);

      const attachment = await attachmentRepo.findOne({
        where: { id: attachmentId, ticketId, deletedAt: IsNull() },
      });
      if (!attachment) {
        throw new NotFoundException(
          `Attachment ${attachmentId} not found for ticket ${ticketId}`,
        );
      }

      await attachmentRepo.softDelete(attachmentId);

      await this.auditLogService.record(
        {
          action: AuditAction.DELETE,
          entityType: AuditEntityType.TICKET_ATTACHMENT,
          entityId: attachment.id,
          performedBy: performedBy ?? ticket.assigneeId ?? ticket.projectId,
          actorType: AuditActor.USER,
          details: {
            ticketId,
            attachmentId: attachment.id,
            filename: attachment.filename,
          },
        },
        manager,
      );
    });
  }

  async removeDependency(
    ticketId: number,
    blockerId: number,
    performedBy?: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);
      const dependencyRepo = manager.getRepository(TicketDependency);

      const ticket = await ticketRepo.findOne({ where: { id: ticketId } });
      this.assertActiveTicketForDependency(ticket, ticketId);

      const blocker = await ticketRepo.findOne({ where: { id: blockerId } });
      this.assertActiveTicketForDependency(blocker, blockerId);

      const dependency = await dependencyRepo.findOne({
        where: { ticketId, blockerId },
      });
      if (!dependency) {
        throw new NotFoundException(
          `Dependency from ticket ${ticketId} to blocker ${blockerId} not found`,
        );
      }

      await dependencyRepo.delete({ ticketId, blockerId });

      await this.auditLogService.record(
        {
          action: AuditAction.DELETE,
          entityType: AuditEntityType.TICKET_DEPENDENCY,
          entityId: dependency.id,
          performedBy: performedBy ?? ticket.assigneeId ?? ticket.projectId,
          actorType: AuditActor.USER,
          details: { ticketId, blockedBy: blockerId },
        },
        manager,
      );
    });
  }

  async exportTicketsCsv(projectId: number): Promise<string> {
    await this.projectsService.findOne(projectId);

    const tickets = await this.ticketRepository.find({
      where: { projectId, deletedAt: IsNull() },
      order: { id: 'ASC' },
    });

    return exportTicketsToCsv(tickets);
  }

  async importTicketsFromCsv(
    projectId: number,
    file: Express.Multer.File,
    performedBy?: number,
  ): Promise<TicketImportResult> {
    await this.projectsService.findOne(projectId);

    let rows: TicketImportCsvRow[];
    try {
      rows = parseTicketImportCsv(file.buffer);
    } catch (error) {
      return {
        created: 0,
        failed: 1,
        errors: [
          {
            row: 1,
            message: this.importRowErrorMessage(error),
          },
        ],
      };
    }

    const result: TicketImportResult = {
      created: 0,
      failed: 0,
      errors: [],
    };

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      try {
        const rowData = await this.resolveImportRow(rows[index]);
        await this.persistImportedTicket(projectId, rowData, performedBy);
        result.created += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          row: rowNumber,
          message: this.importRowErrorMessage(error),
        });
      }
    }

    return result;
  }

  async remove(id: number, performedBy?: number): Promise<void> {
    const ticket = await this.getTicketOrThrow(id);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Ticket).softDelete({ id });
      await this.auditLogService.record(
        {
          action: AuditAction.DELETE,
          entityType: AuditEntityType.TICKET,
          entityId: id,
          performedBy: performedBy ?? ticket.assigneeId ?? ticket.projectId,
          actorType: AuditActor.USER,
          details: { deletedAt: new Date().toISOString() },
        },
        manager,
      );
    });
  }

  private buildTicketUpdateDetails(
    beforeStatus: TicketStatus,
    updateTicketDto: UpdateTicketDto,
    saved: Ticket,
  ): Record<string, unknown> {
    const details: Record<string, unknown> = {};

    if (
      updateTicketDto.status !== undefined &&
      updateTicketDto.status !== beforeStatus
    ) {
      details.from = beforeStatus;
      details.to = saved.status;
    }
    if (updateTicketDto.title !== undefined) {
      details.title = { after: saved.title };
    }
    if (updateTicketDto.description !== undefined) {
      details.description = { after: saved.description };
    }
    if (updateTicketDto.priority !== undefined) {
      details.priority = { after: saved.priority };
    }
    if (updateTicketDto.assigneeId !== undefined) {
      details.assigneeId = { after: saved.assigneeId };
    }
    if (updateTicketDto.dueDate !== undefined) {
      details.dueDate = { after: saved.dueDate };
    }

    return details;
  }

  private async getTicketOrThrow(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    return ticket;
  }

  private assertActiveTicketForDependency(
    ticket: Ticket | null,
    id: number,
  ): asserts ticket is Ticket {
    this.assertActiveTicketForAttachment(ticket, id);
  }

  private assertSameProjectForDependency(ticket: Ticket, blocker: Ticket): void {
    if (ticket.projectId !== blocker.projectId) {
      throw new BadRequestException(
        'Dependency tickets must belong to the same project',
      );
    }
  }

  private async assertNoUnresolvedBlockers(
    dependencyRepo: Repository<TicketDependency>,
    ticketId: number,
  ): Promise<void> {
    const unresolvedCount = await dependencyRepo.count({
      where: {
        ticketId,
        blocker: {
          deletedAt: IsNull(),
          status: Not(TicketStatus.DONE),
        },
      },
    });

    if (unresolvedCount > 0) {
      throw new BadRequestException(
        'Cannot transition to DONE while ticket has unresolved blockers',
      );
    }
  }

  private assertActiveTicketForAttachment(
    ticket: Ticket | null,
    id: number,
  ): asserts ticket is Ticket {
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    if (ticket.deletedAt != null) {
      throw new BadRequestException(`Ticket ${id} is deleted`);
    }
  }

  private toBlockerSummaries(
    dependencies: TicketDependency[],
  ): TicketBlockerSummary[] {
    const byId = new Map<number, TicketBlockerSummary>();

    for (const dependency of dependencies) {
      const blocker = dependency.blocker;
      if (!blocker || byId.has(blocker.id)) {
        continue;
      }
      byId.set(blocker.id, {
        id: blocker.id,
        title: blocker.title,
        status: blocker.status,
      });
    }

    return [...byId.values()].sort((a, b) => a.id - b.id);
  }

  private async resolveImportRow(
    row: TicketImportCsvRow,
  ): Promise<{
    title: string;
    description: string | null;
    status: TicketStatus;
    priority: TicketPriority;
    type: TicketType;
    assigneeId: number | null;
  }> {
    const title = row.title.trim();
    if (!title) {
      throw new Error('Title is required');
    }

    const statusValue = row.status.trim();
    if (!statusValue) {
      throw new Error('Status is required');
    }
    if (!isTicketStatusValue(statusValue)) {
      throw new Error('Invalid ticket status');
    }

    const priorityValue = row.priority.trim();
    if (!priorityValue) {
      throw new Error('Priority is required');
    }
    if (!isTicketPriorityValue(priorityValue)) {
      throw new Error('Invalid ticket priority');
    }

    const typeValue = row.type.trim();
    if (!typeValue) {
      throw new Error('Type is required');
    }
    if (!isTicketTypeValue(typeValue)) {
      throw new Error('Invalid ticket type');
    }

    let assigneeId: number | null = null;
    const assigneeRaw = row.assigneeId.trim();
    if (assigneeRaw.length > 0) {
      const parsedAssigneeId = Number(assigneeRaw);
      if (!Number.isInteger(parsedAssigneeId) || parsedAssigneeId < 1) {
        throw new Error('Invalid assigneeId');
      }
      await this.usersService.findOne(parsedAssigneeId);
      assigneeId = parsedAssigneeId;
    }

    return {
      title,
      description: row.description.trim() ? row.description : null,
      status: statusValue,
      priority: priorityValue,
      type: typeValue,
      assigneeId,
    };
  }

  private async persistImportedTicket(
    projectId: number,
    rowData: {
      title: string;
      description: string | null;
      status: TicketStatus;
      priority: TicketPriority;
      type: TicketType;
      assigneeId: number | null;
    },
    performedBy?: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);
      const ticket = ticketRepo.create({
        title: rowData.title,
        description: rowData.description,
        status: rowData.status,
        priority: rowData.priority,
        type: rowData.type,
        projectId,
        assigneeId: rowData.assigneeId,
        dueDate: null,
        deletedAt: null,
      });

      const saved = await ticketRepo.save(ticket);

      await this.auditLogService.record(
        {
          action: AuditAction.CREATE,
          entityType: AuditEntityType.TICKET,
          entityId: saved.id,
          performedBy: performedBy ?? rowData.assigneeId ?? projectId,
          actorType: AuditActor.USER,
          details: {
            title: saved.title,
            status: saved.status,
            priority: saved.priority,
            type: saved.type,
            projectId: saved.projectId,
            assigneeId: saved.assigneeId,
          },
        },
        manager,
      );
    });
  }

  private importRowErrorMessage(error: unknown): string {
    if (error instanceof NotFoundException) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Failed to import row';
  }

  private rethrowDependencyPersistenceError(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string })?.code === '23505'
    ) {
      throw new ConflictException('Dependency already exists');
    }
    throw error;
  }

}

export type {
  TicketAttachmentResponse,
  TicketBlockerSummary,
  TicketDetailResponse,
  TicketResponse,
};
