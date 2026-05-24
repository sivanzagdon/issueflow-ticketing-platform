import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketType } from '../common/enums/ticket-type.enum';
import { ProjectsService } from '../projects/projects.service';
import { mockProjectResponse } from '../projects/testing/project.fixtures';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { mockTicketEntity } from './testing/ticket.fixtures';
import {
  overdueTicket,
  SLICE16_FIXED_NOW,
  SLICE16_PAST_DUE,
  TicketsServiceSlice16,
} from './testing/escalation.fixtures';
import { Ticket } from './entities/ticket.entity';
import { createEscalationTestModule } from './testing/escalation-test.helpers';

/**
 * Slice 16 — optional dueDate on tickets (README contract).
 */
describe('TicketsService dueDate support (Slice 16)', () => {
  const baseCreateDto: CreateTicketDto = {
    title: 'Due date ticket',
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    type: TicketType.BUG,
    projectId: 1,
  };

  it('create accepts optional dueDate', async () => {
    const { service, ticketRepository, module } =
      await createEscalationTestModule();
    const projectsService = module.get(ProjectsService);
    jest.spyOn(projectsService, 'findOne').mockResolvedValue(mockProjectResponse());

    const entity = mockTicketEntity({
      dueDate: SLICE16_PAST_DUE,
      assigneeId: null,
    });
    ticketRepository.create.mockImplementation((input) => input as typeof entity);
    ticketRepository.save.mockResolvedValue(entity);

    const result = await service.create({
      ...baseCreateDto,
      dueDate: SLICE16_PAST_DUE.toISOString(),
    });

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: expect.any(Date),
      }),
    );
    expect(result.dueDate).toEqual(SLICE16_PAST_DUE);
  });

  it('update accepts optional dueDate', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    const existing = mockTicketEntity({ version: 1, dueDate: null });
    const updated = mockTicketEntity({
      version: 2,
      dueDate: SLICE16_PAST_DUE,
    });
    ticketRepository.findOne.mockResolvedValue(existing);
    ticketRepository.save.mockResolvedValue(updated);

    const result = await service.update(1, {
      version: 1,
      dueDate: SLICE16_PAST_DUE.toISOString(),
    } as UpdateTicketDto);

    expect(ticketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: SLICE16_PAST_DUE }),
    );
    expect(result.dueDate).toEqual(SLICE16_PAST_DUE);
  });

  it('findOne includes dueDate in ticket response', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.findOne.mockResolvedValue(
      mockTicketEntity({ dueDate: SLICE16_PAST_DUE }),
    );

    const result = await service.findOne(1);

    expect(result.dueDate).toEqual(SLICE16_PAST_DUE);
  });

  it('runAutoEscalation ignores tickets without dueDate', async () => {
    const { service, ticketRepository } = await createEscalationTestModule();
    ticketRepository.find.mockResolvedValue([
      overdueTicket({ id: 1, dueDate: null }),
    ]);
    ticketRepository.save.mockImplementation(async (ticket) => ticket as Ticket);

    const summary = await (
      service as TicketsServiceSlice16
    ).runAutoEscalation(SLICE16_FIXED_NOW);

    expect(summary.skipped).toBeGreaterThanOrEqual(1);
    expect(summary.escalated).toBe(0);
    expect(ticketRepository.save).not.toHaveBeenCalled();
  });
});
