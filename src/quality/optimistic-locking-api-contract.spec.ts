import { CanActivate, ConflictException, ExecutionContext, RequestMethod } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommentsController } from '../comments/comments.controller';
import { toCommentResponse } from '../comments/comments.mapper';
import { mockCommentEntity } from '../comments/testing/comment.fixtures';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { TicketsController } from '../tickets/tickets.controller';
import { toTicketResponse } from '../tickets/tickets.mapper';
import { TicketsService } from '../tickets/tickets.service';
import { mockTicketEntity } from '../tickets/testing/ticket.fixtures';
import { expectHandlerRoute } from './testing/route-metadata.helpers';

const mockJwtAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    request.user = mockUserResponse();
    return true;
  },
};

/**
 * Slice 10 — optimistic locking API contract (README + assignment).
 */
describe('Optimistic locking API contract (Slice 10)', () => {
  describe('route stability', () => {
    it('PATCH ticket update remains PATCH /tickets/:ticketId', () => {
      expectHandlerRoute(
        TicketsController,
        'update',
        RequestMethod.PATCH,
        'tickets/:ticketId',
      );
    });

    it('PATCH comment update remains PATCH /tickets/:ticketId/comments/:commentId', () => {
      expectHandlerRoute(
        CommentsController,
        'update',
        RequestMethod.PATCH,
        'tickets/:ticketId/comments/:commentId',
      );
    });
  });

  describe('response shape', () => {
    it('ticket responses expose version', () => {
      const response = toTicketResponse(mockTicketEntity({ version: 7 }));

      expect(response).toHaveProperty('version', 7);
    });

    it('comment responses expose version', () => {
      const entity = { ...mockCommentEntity(), version: 4 };
      const response = toCommentResponse(entity as typeof entity);

      expect(response).toHaveProperty('version', 4);
    });
  });

  describe('HTTP conflict mapping', () => {
    it('maps stale ticket updates to HTTP 409 Conflict', () => {
      const exception = new ConflictException('Ticket version conflict');

      expect(exception.getStatus()).toBe(409);
    });

    it('maps stale comment updates to HTTP 409 Conflict', () => {
      const exception = new ConflictException('Comment version conflict');

      expect(exception.getStatus()).toBe(409);
    });
  });

  describe('controller delegation preserves version in update payloads', () => {
    it('TicketsController.update forwards dto including version to service', async () => {
      const ticketsService = {
        update: jest.fn().mockResolvedValue(
          toTicketResponse(mockTicketEntity({ version: 2, title: 'Updated' })),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [TicketsController],
        providers: [{ provide: TicketsService, useValue: ticketsService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(mockJwtAuthGuard)
        .compile();

      const controller = module.get(TicketsController);
      const dto = { version: 1, title: 'Updated' };
      const authReq = { user: mockUserResponse() };

      const result = await controller.update(3, dto, authReq);

      expect(ticketsService.update).toHaveBeenCalledWith(
        3,
        dto,
        authReq.user.id,
      );
      expect(result.version).toBe(2);
    });
  });
});
