import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { AuthController } from '../auth/auth.controller';
import { CommentsController } from '../comments/comments.controller';
import { ProjectsController } from '../projects/projects.controller';
import { TicketsController } from '../tickets/tickets.controller';
import { UsersController } from '../users/users.controller';

function handlerGuards(
  controllerClass: new (...args: unknown[]) => unknown,
  handlerName: string,
): unknown[] | undefined {
  return Reflect.getMetadata(
    '__guards__',
    controllerClass.prototype[handlerName],
  );
}

function isPublic(
  controllerClass: new (...args: unknown[]) => unknown,
  handlerName: string,
): boolean {
  return (
    Reflect.getMetadata(
      IS_PUBLIC_KEY,
      controllerClass.prototype[handlerName],
    ) === true
  );
}

describe('Security / JWT guard coverage', () => {
  describe('public routes', () => {
    it('POST /auth/login has no JwtAuthGuard on controller or handler', () => {
      const classGuards = Reflect.getMetadata('__guards__', AuthController);
      const loginGuards = handlerGuards(AuthController, 'login');
      expect(classGuards ?? []).not.toContain(JwtAuthGuard);
      expect(loginGuards ?? []).not.toContain(JwtAuthGuard);
    });

    it('POST /users is public via @Public() for registration', () => {
      expect(isPublic(UsersController, 'create')).toBe(true);
    });
  });

  describe('UsersController protected routes', () => {
    it('applies JwtAuthGuard at controller level', () => {
      const guards = Reflect.getMetadata('__guards__', UsersController);
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
    });

    it.each(['findAll', 'findOne', 'update', 'remove'] as const)(
      '%s is not marked @Public()',
      (handler) => {
        expect(isPublic(UsersController, handler)).not.toBe(true);
      },
    );
  });

  describe('AuthController protected routes', () => {
    it.each(['logout', 'me'] as const)(
      '%s uses JwtAuthGuard on the handler',
      (handler) => {
        const guards = handlerGuards(AuthController, handler);
        expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
      },
    );
  });

  describe('ProjectsController', () => {
    it('applies JwtAuthGuard to all project routes', () => {
      const guards = Reflect.getMetadata('__guards__', ProjectsController);
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
    });

    it.each(['create', 'findAll', 'findOne', 'update', 'remove'] as const)(
      '%s is not public',
      (handler) => {
        expect(isPublic(ProjectsController, handler)).not.toBe(true);
      },
    );
  });

  describe('TicketsController', () => {
    it('applies JwtAuthGuard to all ticket routes', () => {
      const guards = Reflect.getMetadata('__guards__', TicketsController);
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
    });
  });

  describe('CommentsController', () => {
    it('applies JwtAuthGuard to all comment routes', () => {
      const guards = Reflect.getMetadata('__guards__', CommentsController);
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
    });

    it.each(['create', 'findByTicket', 'update', 'remove'] as const)(
      '%s is not public',
      (handler) => {
        expect(isPublic(CommentsController, handler)).not.toBe(true);
      },
    );
  });
});
