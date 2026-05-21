import { CanActivate, ExecutionContext, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { mockCommentResponse } from './testing/comment.fixtures';
import { CommentsController } from './comments.controller';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const mockJwtAuthGuard: CanActivate = {
  canActivate: (_context: ExecutionContext) => true,
};

describe('CommentsController', () => {
  let controller: CommentsController;
  let commentsService: jest.Mocked<CommentsService>;
  const authReq = { user: mockUserResponse() };

  beforeEach(async () => {
    commentsService = {
      create: jest.fn(),
      findByTicket: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CommentsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: commentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get(CommentsController);
  });

  it('applies JwtAuthGuard to comment routes', () => {
    const guards = Reflect.getMetadata('__guards__', CommentsController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  it('uses ParseIntPipe for ticketId and commentId route params in controller source', () => {
    const controllerPath = path.join(__dirname, 'comments.controller.ts');
    const source = fs.readFileSync(controllerPath, 'utf8');
    expect(source).toContain(`Param('ticketId', ParseIntPipe)`);
    expect(source).toContain(`Param('commentId', ParseIntPipe)`);
  });

  it('POST create uses route tickets/:ticketId/comments', () => {
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      CommentsController.prototype.create,
    );
    const path = Reflect.getMetadata(
      PATH_METADATA,
      CommentsController.prototype.create,
    );
    expect(method).toBe(RequestMethod.POST);
    expect(path).toBe('tickets/:ticketId/comments');
  });

  it('GET findByTicket uses route tickets/:ticketId/comments', () => {
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      CommentsController.prototype.findByTicket,
    );
    const path = Reflect.getMetadata(
      PATH_METADATA,
      CommentsController.prototype.findByTicket,
    );
    expect(method).toBe(RequestMethod.GET);
    expect(path).toBe('tickets/:ticketId/comments');
  });

  it('PATCH update uses route tickets/:ticketId/comments/:commentId', () => {
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      CommentsController.prototype.update,
    );
    const path = Reflect.getMetadata(
      PATH_METADATA,
      CommentsController.prototype.update,
    );
    expect(method).toBe(RequestMethod.PATCH);
    expect(path).toBe('tickets/:ticketId/comments/:commentId');
  });

  it('DELETE remove uses route tickets/:ticketId/comments/:commentId', () => {
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      CommentsController.prototype.remove,
    );
    const path = Reflect.getMetadata(
      PATH_METADATA,
      CommentsController.prototype.remove,
    );
    expect(method).toBe(RequestMethod.DELETE);
    expect(path).toBe('tickets/:ticketId/comments/:commentId');
  });

  describe('create', () => {
    it('delegates to CommentsService.create with ticketId and body', async () => {
      const dto: CreateCommentDto = { authorId: 3, content: 'Note' };
      const created = mockCommentResponse();
      commentsService.create.mockResolvedValue(created);

      const result = await controller.create(7, dto);

      expect(commentsService.create).toHaveBeenCalledWith(7, dto);
      expect(result).toEqual(created);
    });
  });

  describe('findByTicket', () => {
    it('delegates to CommentsService.findByTicket with ticketId', async () => {
      const list = [mockCommentResponse(), mockCommentResponse({ id: 2 })];
      commentsService.findByTicket.mockResolvedValue(list);

      const result = await controller.findByTicket(4);

      expect(commentsService.findByTicket).toHaveBeenCalledWith(4);
      expect(result).toEqual(list);
    });
  });

  describe('update', () => {
    it('delegates to CommentsService.update with commentId and body', async () => {
      const dto: UpdateCommentDto = { content: 'Revised' };
      const updated = mockCommentResponse({ content: 'Revised' });
      commentsService.update.mockResolvedValue(updated);

      const result = await controller.update(4, 11, dto, authReq);

      expect(commentsService.update).toHaveBeenCalledWith(
        11,
        dto,
        authReq.user.id,
      );
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('delegates to CommentsService.remove with commentId', async () => {
      commentsService.remove.mockResolvedValue(undefined);

      await controller.remove(4, 15, authReq);

      expect(commentsService.remove).toHaveBeenCalledWith(15, authReq.user.id);
    });
  });
});
