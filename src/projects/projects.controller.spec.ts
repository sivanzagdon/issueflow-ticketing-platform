import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { mockProjectResponse } from './testing/project.fixtures';

const mockJwtAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    request.user = mockProjectResponse();
    return true;
  },
};

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsService: jest.Mocked<ProjectsService>;

  beforeEach(async () => {
    projectsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ProjectsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: projectsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get(ProjectsController);
  });

  it('applies JwtAuthGuard to project routes', () => {
    const guards = Reflect.getMetadata('__guards__', ProjectsController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  describe('create', () => {
    it('delegates to ProjectsService.create', async () => {
      const dto: CreateProjectDto = {
        name: 'Sample Project',
        description: 'A sample project',
        ownerId: 1,
      };
      const created = mockProjectResponse();
      projectsService.create.mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(projectsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('findAll', () => {
    it('delegates to ProjectsService.findAll', async () => {
      const projects = [mockProjectResponse()];
      projectsService.findAll.mockResolvedValue(projects);

      const result = await controller.findAll();

      expect(projectsService.findAll).toHaveBeenCalled();
      expect(result).toEqual(projects);
    });
  });

  describe('findOne', () => {
    it('delegates to ProjectsService.findOne with parsed projectId', async () => {
      const project = mockProjectResponse();
      projectsService.findOne.mockResolvedValue(project);

      const result = await controller.findOne(1);

      expect(projectsService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(project);
    });
  });

  describe('update', () => {
    it('delegates to ProjectsService.update', async () => {
      const dto: UpdateProjectDto = {
        name: 'Updated Name',
        description: 'Updated description',
      };
      const updated = mockProjectResponse({
        name: 'Updated Name',
        description: 'Updated description',
      });
      projectsService.update.mockResolvedValue(updated);

      const result = await controller.update(1, dto);

      expect(projectsService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('delegates to ProjectsService.remove with parsed projectId', async () => {
      projectsService.remove.mockResolvedValue(undefined);

      await controller.remove(1);

      expect(projectsService.remove).toHaveBeenCalledWith(1);
    });
  });
});
