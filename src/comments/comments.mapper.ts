import { User } from '../users/entities/user.entity';
import { Comment } from './entities/comment.entity';

export type MentionedUserSummary = {
  id: number;
  username: string;
  fullName: string;
};

export type CommentResponse = Pick<
  Comment,
  | 'id'
  | 'ticketId'
  | 'authorId'
  | 'content'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
> & {
  mentionedUsers: MentionedUserSummary[];
};

export function toMentionedUser(user: User): MentionedUserSummary {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
  };
}

export function toCommentResponse(
  comment: Comment,
  mentionedUsers: MentionedUserSummary[] = [],
): CommentResponse {
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    authorId: comment.authorId,
    content: comment.content,
    version: comment.version,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    mentionedUsers,
  };
}
