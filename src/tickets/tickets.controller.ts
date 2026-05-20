import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Body() createTicketDto: CreateTicketDto) {
    return this.ticketsService.create(createTicketDto);
  }

  @Get()
  findAll(@Query('projectId', ParseIntPipe) projectId: number) {
    return this.ticketsService.findAll(projectId);
  }

  @Get(':ticketId')
  findOne(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.findOne(ticketId);
  }

  @Patch(':ticketId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() updateTicketDto: UpdateTicketDto,
  ) {
    return this.ticketsService.update(ticketId, updateTicketDto);
  }

  @Delete(':ticketId')
  remove(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.remove(ticketId);
  }
}
