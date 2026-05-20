import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import { TicketResponse } from './tickets.mapper';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
  ) {}

  create(_createTicketDto: CreateTicketDto): Promise<TicketResponse> {
    throw new Error('Not implemented');
  }

  findAll(_projectId: number): Promise<TicketResponse[]> {
    throw new Error('Not implemented');
  }

  findOne(_id: number): Promise<TicketResponse> {
    throw new Error('Not implemented');
  }

  update(_id: number, _updateTicketDto: UpdateTicketDto): Promise<TicketResponse> {
    throw new Error('Not implemented');
  }

  remove(_id: number): Promise<void> {
    throw new Error('Not implemented');
  }
}
