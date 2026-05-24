import { RequestMethod } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { mockUserResponse } from '../users/testing/user.fixtures';
import {
  expectTicketBlockerListShape,
  mockBlockerList,
  TicketBlockerList,
  TicketsServiceSlice12,
} from '../tickets/testing/dependency.fixtures';
import { TicketsController } from '../tickets/tickets.controller';
import { TicketsService } from '../tickets/tickets.service';
import { expectHandlerRoute } from './testing/route-metadata.helpers';

type TicketsControllerSlice12 = TicketsController & {
  addDependency(
    ticketId: number,
    body: { blockedBy: number },
    req: { user: { id: number } },
  ): Promise<void>;
  getDependencies(ticketId: number): Promise<TicketBlockerList>;
  removeDependency(
    ticketId: number,
    blockerId: number,
    req: { user: { id: number } },
  ): Promise<void>;
};

/**
 * Slice 12 — ticket dependencies API contract (README).
 */
describe('Ticket dependencies API contract (Slice 12)', () => {
  describe('TicketsController routes', () => {
    it.each([
      ['addDependency', RequestMethod.POST, 'tickets/:ticketId/dependencies'],
      ['getDependencies', RequestMethod.GET, 'tickets/:ticketId/dependencies'],
      [
        'removeDependency',
        RequestMethod.DELETE,
        'tickets/:ticketId/dependencies/:blockerId',
      ],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(TicketsController, handler, method, path);
    });
  });

  describe('controller delegation', () => {
    let controller: TicketsControllerSlice12;
    let ticketsService: TicketsServiceSlice12;

    beforeEach(async () => {
      ticketsService = {
        addDependency: jest.fn().mockResolvedValue(undefined),
        getDependencies: jest.fn().mockResolvedValue(
          mockBlockerList([
            { id: 42, title: 'Blocker', status: TicketStatus.TODO },
          ]),
        ),
        removeDependency: jest.fn().mockResolvedValue(undefined),
      } as unknown as TicketsServiceSlice12;

      const module: TestingModule = await Test.createTestingModule({
        controllers: [TicketsController],
        providers: [{ provide: TicketsService, useValue: ticketsService }],
      }).compile();

      controller = module.get(TicketsController) as TicketsControllerSlice12;
    });

    it('addDependency accepts blockedBy and delegates to service', async () => {
      await controller.addDependency(
        10,
        { blockedBy: 42 },
        { user: mockUserResponse() },
      );

      expect(ticketsService.addDependency).toHaveBeenCalledWith(10, 42, 1);
    });

    it('getDependencies returns README array of blocker summaries', async () => {
      const result = await controller.getDependencies(10);

      expect(ticketsService.getDependencies).toHaveBeenCalledWith(10);
      expectTicketBlockerListShape(result);
      expect(result).toEqual([
        { id: 42, title: 'Blocker', status: TicketStatus.TODO },
      ]);
    });

    it('removeDependency delegates with ticketId and blockerId', async () => {
      await controller.removeDependency(10, 42, { user: mockUserResponse() });

      expect(ticketsService.removeDependency).toHaveBeenCalledWith(10, 42, 1);
    });
  });
});
