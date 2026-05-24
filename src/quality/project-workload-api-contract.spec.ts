import { NotFoundException, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import {
  expectProjectWorkloadListShape,
  mockWorkloadList,
  ProjectsServiceSlice15,
} from '../projects/testing/workload.fixtures';
import { ProjectsController } from '../projects/projects.controller';
import { ProjectsService } from '../projects/projects.service';
import { expectHandlerRoute, getHandlerRoute } from './testing/route-metadata.helpers';

type ProjectsControllerSlice15 = ProjectsController & {
  getProjectWorkload(projectId: number): Promise<
    import('../projects/testing/workload.fixtures').ProjectWorkloadEntry[]
  >;
};

const WORKLOAD_HANDLER = 'getProjectWorkload' as const;

function workloadHandler(): ProjectsControllerSlice15['getProjectWorkload'] | undefined {
  return (ProjectsController.prototype as ProjectsControllerSlice15)
    .getProjectWorkload;
}

/**
 * Slice 15 — GET /projects/:projectId/workload API contract (README).
 */
describe('Project workload API contract (Slice 15)', () => {
  describe('ProjectsController route metadata', () => {
    it('registers getProjectWorkload handler', () => {
      expect(workloadHandler()).toBeDefined();
    });

    it('getProjectWorkload is GET /projects/:projectId/workload', () => {
      expectHandlerRoute(
        ProjectsController,
        WORKLOAD_HANDLER,
        RequestMethod.GET,
        'projects/:projectId/workload',
      );
    });

    it('uses a workload-specific path segment (not generic project by id only)', () => {
      const handler = workloadHandler();
      expect(handler).toBeDefined();
      const handlerPath = Reflect.getMetadata(PATH_METADATA, handler!) as string;
      const { path } = getHandlerRoute(ProjectsController, 'getProjectWorkload');

      expect(handlerPath).toContain('workload');
      expect(path).toBe('projects/:projectId/workload');
      expect(path).not.toBe('projects/:projectId');
    });

    it('getProjectWorkload uses 200 OK per README', () => {
      const handler = workloadHandler();
      expect(handler).toBeDefined();
      const httpCode = Reflect.getMetadata(HTTP_CODE_METADATA, handler!) as
        | number
        | undefined;
      expect(httpCode).toBe(200);
    });

    it('getProjectWorkload uses GET method metadata', () => {
      const handler = workloadHandler();
      expect(handler).toBeDefined();
      expect(Reflect.getMetadata(METHOD_METADATA, handler!)).toBe(RequestMethod.GET);
    });
  });

  describe('controller security metadata', () => {
    it('requires JWT for project routes including workload', () => {
      const classGuards = Reflect.getMetadata('__guards__', ProjectsController) as
        | unknown[]
        | undefined;
      expect(classGuards).toEqual(expect.arrayContaining([JwtAuthGuard]));
    });

    it('does not mark getProjectWorkload as public', () => {
      const handler = workloadHandler();
      expect(handler).toBeDefined();
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler!)).not.toBe(true);
    });
  });

  describe('controller delegation', () => {
    let controller: ProjectsControllerSlice15;
    let projectsService: jest.Mocked<Pick<ProjectsServiceSlice15, 'getProjectWorkload'>>;

    beforeEach(async () => {
      projectsService = {
        getProjectWorkload: jest.fn().mockResolvedValue(
          mockWorkloadList([
            { userId: 1, username: 'jdoe', openTicketCount: 3 },
            { userId: 2, username: 'asmith', openTicketCount: 5 },
          ]),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [{ provide: ProjectsService, useValue: projectsService }],
      }).compile();

      controller = module.get(ProjectsController) as ProjectsControllerSlice15;
    });

    it('delegates projectId to ProjectsService.getProjectWorkload', async () => {
      const workload = mockWorkloadList([
        { userId: 1, username: 'jdoe', openTicketCount: 3 },
        { userId: 2, username: 'asmith', openTicketCount: 5 },
      ]);
      projectsService.getProjectWorkload.mockResolvedValue(workload);

      const result = await controller.getProjectWorkload(5);

      expect(projectsService.getProjectWorkload).toHaveBeenCalledTimes(1);
      expect(projectsService.getProjectWorkload).toHaveBeenCalledWith(5);
      expect(result).toBe(workload);
    });

    it('returns README workload array shape from service', async () => {
      const result = await controller.getProjectWorkload(5);

      expectProjectWorkloadListShape(result);
      expect(result).toEqual([
        { userId: 1, username: 'jdoe', openTicketCount: 3 },
        { userId: 2, username: 'asmith', openTicketCount: 5 },
      ]);
    });

    it('returns a bare array without pagination wrapper', async () => {
      const result = await controller.getProjectWorkload(5);

      expect(Array.isArray(result)).toBe(true);
      expect(result).not.toHaveProperty('data');
      expect(result).not.toHaveProperty('total');
    });

    it('propagates service NotFoundException without wrapping', async () => {
      projectsService.getProjectWorkload.mockRejectedValue(
        new NotFoundException('Project 99 not found'),
      );

      await expect(controller.getProjectWorkload(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
