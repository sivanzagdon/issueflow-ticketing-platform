import { CommentResponse, toCommentResponse } from '../comments.mapper';
import { Comment } from '../entities/comment.entity';

export const mockCommentEntity = (overrides: Partial<Comment> = {}): Comment => ({
  id: 1,
  ticketId: 1,
  authorId: 2,
  content: 'A thoughtful comment',
  ticket: {} as Comment['ticket'],
  author: {} as Comment['author'],
  createdAt: new Date('2026-01-01T12:00:00.000Z'),
  updatedAt: new Date('2026-01-01T12:00:00.000Z'),
  ...overrides,
});

export const mockCommentResponse = (
  overrides: Partial<CommentResponse> = {},
): CommentResponse => ({
  ...toCommentResponse(mockCommentEntity()),
  ...overrides,
});
