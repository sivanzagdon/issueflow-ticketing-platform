import { RequestMethod } from '@nestjs/common';
import { AuthController } from '../auth/auth.controller';
import { CommentsController } from '../comments/comments.controller';
import { ProjectsController } from '../projects/projects.controller';
import { TicketsController } from '../tickets/tickets.controller';
import { UsersController } from '../users/users.controller';
import { expectHandlerRoute } from './testing/route-metadata.helpers';

/**
 * README-aligned route contract (HTTP method + path).
 * Fills gaps not already asserted in per-controller specs.
 */
describe('API contract metadata', () => {
  describe('UsersController', () => {
    it.each([
      ['create', RequestMethod.POST, 'users'],
      ['findAll', RequestMethod.GET, 'users'],
      ['findOne', RequestMethod.GET, 'users/:userId'],
      ['update', RequestMethod.POST, 'users/update/:userId'],
      ['remove', RequestMethod.DELETE, 'users/:userId'],
    ] as const)(
      '%s is %s /%s',
      (handler, method, path) => {
        expectHandlerRoute(UsersController, handler, method, path);
      },
    );
  });

  describe('AuthController', () => {
    it.each([
      ['login', RequestMethod.POST, 'auth/login'],
      ['logout', RequestMethod.POST, 'auth/logout'],
      ['me', RequestMethod.GET, 'auth/me'],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(AuthController, handler, method, path);
    });
  });

  describe('ProjectsController', () => {
    it.each([
      ['create', RequestMethod.POST, 'projects'],
      ['findAll', RequestMethod.GET, 'projects'],
      ['findOne', RequestMethod.GET, 'projects/:projectId'],
      ['update', RequestMethod.PATCH, 'projects/:projectId'],
      ['remove', RequestMethod.DELETE, 'projects/:projectId'],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(ProjectsController, handler, method, path);
    });
  });

  describe('TicketsController', () => {
    it.each([
      ['create', RequestMethod.POST, 'tickets'],
      ['findAll', RequestMethod.GET, 'tickets'],
      ['findOne', RequestMethod.GET, 'tickets/:ticketId'],
      ['update', RequestMethod.PATCH, 'tickets/:ticketId'],
      ['remove', RequestMethod.DELETE, 'tickets/:ticketId'],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(TicketsController, handler, method, path);
    });
  });

  describe('CommentsController', () => {
    it.each([
      ['create', RequestMethod.POST, 'tickets/:ticketId/comments'],
      ['findByTicket', RequestMethod.GET, 'tickets/:ticketId/comments'],
      ['update', RequestMethod.PATCH, 'tickets/:ticketId/comments/:commentId'],
      ['remove', RequestMethod.DELETE, 'tickets/:ticketId/comments/:commentId'],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(CommentsController, handler, method, path);
    });
  });
});
