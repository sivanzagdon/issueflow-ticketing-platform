import { RequestMethod } from '@nestjs/common';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { ProjectsController } from '../projects/projects.controller';
import { TicketsController } from '../tickets/tickets.controller';
import { expectHandlerRoute } from './testing/route-metadata.helpers';

function handlerGuards(
  controllerClass: new (...args: unknown[]) => unknown,
  handlerName: string,
): unknown[] | undefined {
  return Reflect.getMetadata(
    '__guards__',
    controllerClass.prototype[handlerName],
  );
}

function handlerRoles(
  controllerClass: new (...args: unknown[]) => unknown,
  handlerName: string,
): UserRole[] | undefined {
  return Reflect.getMetadata(ROLES_KEY, controllerClass.prototype[handlerName]);
}

/**
 * README soft-delete API contract (Slice 9).
 */
describe('Soft delete API contract (README)', () => {
  describe('TicketsController', () => {
    it.each([
      ['findAllDeleted', RequestMethod.GET, 'tickets/deleted'],
      ['restore', RequestMethod.POST, 'tickets/:ticketId/restore'],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(TicketsController, handler, method, path);
    });

    it.each(['findAllDeleted', 'restore'] as const)(
      '%s requires ADMIN via RolesGuard',
      (handler) => {
        expect(handlerGuards(TicketsController, handler)).toEqual(
          expect.arrayContaining([RolesGuard]),
        );
        expect(handlerRoles(TicketsController, handler)).toEqual([UserRole.ADMIN]);
      },
    );
  });

  describe('ProjectsController', () => {
    it.each([
      ['findAllDeleted', RequestMethod.GET, 'projects/deleted'],
      ['restore', RequestMethod.POST, 'projects/:projectId/restore'],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(ProjectsController, handler, method, path);
    });

    it.each(['findAllDeleted', 'restore'] as const)(
      '%s requires ADMIN via RolesGuard',
      (handler) => {
        expect(handlerGuards(ProjectsController, handler)).toEqual(
          expect.arrayContaining([RolesGuard]),
        );
        expect(handlerRoles(ProjectsController, handler)).toEqual([UserRole.ADMIN]);
      },
    );
  });
});
