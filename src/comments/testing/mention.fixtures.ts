import { FindOperator, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
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

/** Alias used by Slice 11 specs — production entity is CommentMention. */
export { CommentMention as CommentMentionEntityStub } from '../entities/comment-mention.entity';

function usernameFromWhereClause(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof FindOperator) {
    return String(value.value);
  }
  return null;
}

export function mockUserFindByUsernames(
  userRepository: { find: jest.MockedFunction<Repository<User>['find']> },
  users: import('../../users/entities/user.entity').User[],
): void {
  userRepository.find.mockImplementation(async (options) => {
    const where = options?.where;
    if (!where) {
      return users;
    }
    if (Array.isArray(where)) {
      const requested = where
        .map((clause) =>
          usernameFromWhereClause((clause as { username: unknown }).username),
        )
        .filter((name): name is string => name !== null);
      return users.filter((u) =>
        requested.some((name) => name.toLowerCase() === u.username.toLowerCase()),
      );
    }
    const single = where as { username?: unknown };
    if (single.username) {
      const raw = Array.isArray(single.username)
        ? single.username
        : [single.username];
      const requested = raw
        .map((value) => usernameFromWhereClause(value))
        .filter((name): name is string => name !== null);
      return users.filter((u) =>
        requested.some((name) => name.toLowerCase() === u.username.toLowerCase()),
      );
    }
    return users;
  });
}

export function createMockMentionRepository(): {
  save: jest.Mock;
  find: jest.Mock;
  delete: jest.Mock;
  create: jest.Mock;
  remove: jest.Mock;
} {
  return {
    save: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
    create: jest.fn((dto: { commentId: number; userId: number }) => ({
      id: 1,
      createdAt: new Date(),
      ...dto,
    })),
    remove: jest.fn().mockResolvedValue(undefined),
  };
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
