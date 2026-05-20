import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import { TicketResponse, toTicketResponse } from './tickets.mapper';

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
  ) {}

  async create(createTicketDto: CreateTicketDto): Promise<TicketResponse> {
    await this.projectsService.findOne(createTicketDto.projectId);

    if (createTicketDto.assigneeId != null) {
      await this.usersService.findOne(createTicketDto.assigneeId);
    }

    const ticket = this.ticketRepository.create({
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

    const saved = await this.ticketRepository.save(ticket);
    return toTicketResponse(saved);
  }

  async findAll(projectId: number): Promise<TicketResponse[]> {
    const tickets = await this.ticketRepository.find({
      where: { projectId },
    });
    return tickets.map(toTicketResponse);
  }

  async findOne(id: number): Promise<TicketResponse> {
    const ticket = await this.getTicketOrThrow(id);
    return toTicketResponse(ticket);
  }

  async update(
    id: number,
    updateTicketDto: UpdateTicketDto,
  ): Promise<TicketResponse> {
    const ticket = await this.getTicketOrThrow(id);

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

    const saved = await this.ticketRepository.save(ticket);
    return toTicketResponse(saved);
  }

  async remove(id: number): Promise<void> {
    await this.getTicketOrThrow(id);
    await this.ticketRepository.softDelete({ id });
  }

  private async getTicketOrThrow(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    return ticket;
  }
}

export type { TicketResponse };
