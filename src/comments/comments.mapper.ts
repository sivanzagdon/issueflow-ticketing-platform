import { Comment } from './entities/comment.entity';

export type CommentResponse = Pick<
  Comment,
  | 'id'
  | 'ticketId'
  | 'authorId'
  | 'content'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
>;

export function toCommentResponse(comment: Comment): CommentResponse {
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    authorId: comment.authorId,
    content: comment.content,
    version: comment.version,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}
