import { CanActivate, ExecutionContext, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { mockTicketResponse } from './testing/ticket.fixtures';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

const mockJwtAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    request.user = mockTicketResponse();
    return true;
  },
};

describe('TicketsController', () => {
  let controller: TicketsController;
  let ticketsService: jest.Mocked<TicketsService>;

  beforeEach(async () => {
    ticketsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<TicketsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useValue: ticketsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get(TicketsController);
  });

  it('applies JwtAuthGuard to ticket routes', () => {
    const guards = Reflect.getMetadata('__guards__', TicketsController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  describe('create', () => {
    it('delegates to TicketsService.create', async () => {
      const dto: CreateTicketDto = {
        title: 'Fix login bug',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId: 1,
      };
      const created = mockTicketResponse();
      ticketsService.create.mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(ticketsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('findAll', () => {
    it('delegates to TicketsService.findAll with projectId from query', async () => {
      const tickets = [mockTicketResponse()];
      ticketsService.findAll.mockResolvedValue(tickets);

      const result = await controller.findAll(5);

      expect(ticketsService.findAll).toHaveBeenCalledWith(5);
      expect(result).toEqual(tickets);
    });
  });

  describe('findOne', () => {
    it('delegates to TicketsService.findOne with parsed ticketId', async () => {
      const ticket = mockTicketResponse();
      ticketsService.findOne.mockResolvedValue(ticket);

      const result = await controller.findOne(1);

      expect(ticketsService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(ticket);
    });
  });

  describe('update', () => {
    it('uses PATCH /tickets/:ticketId', () => {
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        TicketsController.prototype.update,
      );
      const path = Reflect.getMetadata(
        PATH_METADATA,
        TicketsController.prototype.update,
      );

      expect(method).toBe(RequestMethod.PATCH);
      expect(path).toBe(':ticketId');
    });

    it('delegates to TicketsService.update', async () => {
      const dto: UpdateTicketDto = { status: TicketStatus.IN_PROGRESS };
      const updated = mockTicketResponse({ status: TicketStatus.IN_PROGRESS });
      ticketsService.update.mockResolvedValue(updated);

      const result = await controller.update(1, dto);

      expect(ticketsService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('delegates to TicketsService.remove with parsed ticketId', async () => {
      ticketsService.remove.mockResolvedValue(undefined);

      await controller.remove(1);

      expect(ticketsService.remove).toHaveBeenCalledWith(1);
    });
  });
});
