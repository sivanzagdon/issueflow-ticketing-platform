import { CommentResponse } from '../comments.mapper';

export type MentionedUserSummary = {
  id: number;
  username: string;
  fullName: string;
};

export type CommentResponseWithMentions = CommentResponse & {
  mentionedUsers: MentionedUserSummary[];
};

export type PaginatedMentionsResponse = {
  data: CommentResponseWithMentions[];
  total: number;
  page: number;
};

/** Stand-in entity token for mention association persistence (feat slice-11). */
export class CommentMentionEntityStub {
  commentId!: number;
  userId!: number;
}

export const mockMentionedUser = (
  overrides: Partial<MentionedUserSummary> = {},
): MentionedUserSummary => ({
  id: 1,
  username: 'jdoe',
  fullName: 'John Doe',
  ...overrides,
});

export function expectMentionedUserShape(user: unknown): void {
  expect(user).toEqual(
    expect.objectContaining({
      id: expect.any(Number),
      username: expect.any(String),
      fullName: expect.any(String),
    }),
  );
  expect(user).not.toHaveProperty('passwordHash');
  expect(user).not.toHaveProperty('email');
}

export function expectCommentWithMentionsShape(
  comment: CommentResponseWithMentions,
): void {
  expect(comment).toHaveProperty('id');
  expect(comment).toHaveProperty('ticketId');
  expect(comment).toHaveProperty('authorId');
  expect(comment).toHaveProperty('content');
  expect(comment).toHaveProperty('version');
  expect(comment).toHaveProperty('createdAt');
  expect(comment).toHaveProperty('updatedAt');
  expect(comment).toHaveProperty('mentionedUsers');
  expect(Array.isArray(comment.mentionedUsers)).toBe(true);
  comment.mentionedUsers.forEach(expectMentionedUserShape);
}

export function expectPaginatedMentionsShape(body: PaginatedMentionsResponse): void {
  expect(body).toHaveProperty('data');
  expect(body).toHaveProperty('total');
  expect(body).toHaveProperty('page');
  expect(Array.isArray(body.data)).toBe(true);
  body.data.forEach(expectCommentWithMentionsShape);
}
