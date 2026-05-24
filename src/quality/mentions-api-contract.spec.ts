import { CanActivate, ExecutionContext, RequestMethod } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { expectHandlerRoute } from '../quality/testing/route-metadata.helpers';
import {
  expectPaginatedMentionsShape,
  PaginatedMentionsResponse,
} from '../comments/testing/mention.fixtures';

const mockJwtAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    request.user = mockUserResponse();
    return true;
  },
};

type UsersServiceWithMentions = UsersService & {
  findMentionsForUser(
    userId: number,
    query: { page?: number; pageSize?: number },
  ): Promise<PaginatedMentionsResponse>;
};

/**
 * Slice 11 — mentions API contract (README).
 */
describe('Mentions API contract (Slice 11)', () => {
  describe('UsersController route', () => {
    it('GET findMentionsForUser is GET users/:userId/mentions', () => {
      expectHandlerRoute(
        UsersController,
        'findMentionsForUser',
        RequestMethod.GET,
        'users/:userId/mentions',
      );
    });
  });

  describe('controller delegation', () => {
    it('delegates to UsersService.findMentionsForUser with pagination query', async () => {
      const paginated: PaginatedMentionsResponse = {
        data: [],
        total: 0,
        page: 1,
      };
      const usersService = {
        findMentionsForUser: jest.fn().mockResolvedValue(paginated),
      } as unknown as UsersServiceWithMentions;

      const module: TestingModule = await Test.createTestingModule({
        controllers: [UsersController],
        providers: [{ provide: UsersService, useValue: usersService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(mockJwtAuthGuard)
        .compile();

      const controller = module.get(UsersController);
      const result = await (
        controller as unknown as {
          findMentionsForUser: (
            userId: number,
            query: { page?: number; pageSize?: number },
          ) => Promise<PaginatedMentionsResponse>;
        }
      ).findMentionsForUser(5, { page: 2, pageSize: 10 });

      expect(usersService.findMentionsForUser).toHaveBeenCalledWith(5, {
        page: 2,
        pageSize: 10,
      });
      expectPaginatedMentionsShape(result);
    });
  });
});
