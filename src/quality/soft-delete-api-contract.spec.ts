import { RequestMethod } from '@nestjs/common';
import { ProjectsController } from '../projects/projects.controller';
import { TicketsController } from '../tickets/tickets.controller';
import { expectHandlerRoute } from './testing/route-metadata.helpers';

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
  });

  describe('ProjectsController', () => {
    it.each([
      ['findAllDeleted', RequestMethod.GET, 'projects/deleted'],
      ['restore', RequestMethod.POST, 'projects/:projectId/restore'],
    ] as const)('%s is %s /%s', (handler, method, path) => {
      expectHandlerRoute(ProjectsController, handler, method, path);
    });
  });

  describe('ADMIN authorization (RBAC not implemented yet)', () => {
    it.todo(
      'pending: GET /tickets/deleted requires ADMIN when role guards are added',
    );
    it.todo(
      'pending: POST /tickets/:ticketId/restore requires ADMIN when role guards are added',
    );
    it.todo('pending: GET /projects/deleted requires ADMIN when role guards are added');
    it.todo(
      'pending: POST /projects/:projectId/restore requires ADMIN when role guards are added',
    );
  });
});
