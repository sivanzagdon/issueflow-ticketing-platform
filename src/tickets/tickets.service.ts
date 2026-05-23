import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import {
  TicketDetailResponse,
  TicketResponse,
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
      const saved = await manager.getRepository(Ticket).save(ticket);
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

}

export type { TicketResponse, TicketDetailResponse };
