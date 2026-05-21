import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UsersService } from '../users/users.service';
import { mockUserResponse } from '../users/testing/user.fixtures';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';
import {
  mockProjectEntity,
  mockProjectResponse,
} from './testing/project.fixtures';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const createDto: CreateProjectDto = {
    name: 'Sample Project',
    description: 'A sample project',
    ownerId: 1,
  };

  beforeEach(async () => {
    projectRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<Repository<Project>>;

    usersService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepository },
        { provide: UsersService, useValue: usersService },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn().mockResolvedValue({ id: 1 }) },
        },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  describe('create', () => {
    it('creates project when owner exists', async () => {
      const entity = mockProjectEntity();
      usersService.findOne.mockResolvedValue(mockUserResponse());
      projectRepository.create.mockReturnValue(entity);
      projectRepository.save.mockResolvedValue(entity);

      const result = await service.create(createDto);

      expect(usersService.findOne).toHaveBeenCalledWith(createDto.ownerId);
      expect(projectRepository.create).toHaveBeenCalledWith({
        name: createDto.name,
        description: createDto.description,
        ownerId: createDto.ownerId,
      });
      expect(projectRepository.save).toHaveBeenCalledWith(entity);
      expect(result).toEqual(mockProjectResponse());
    });

    it('rejects create when owner does not exist with NotFoundException', async () => {
      usersService.findOne.mockRejectedValue(
        new NotFoundException('User 1 not found'),
      );

      await expect(service.create(createDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('returns all projects', async () => {
      projectRepository.find.mockResolvedValue([
        mockProjectEntity(),
        mockProjectEntity({
          id: 2,
          name: 'Second Project',
          ownerId: 2,
        }),
      ]);

      const result = await service.findAll();

      expect(projectRepository.find).toHaveBeenCalled();
      expect(result).toEqual([
        mockProjectResponse(),
        mockProjectResponse({
          id: 2,
          name: 'Second Project',
          ownerId: 2,
        }),
      ]);
    });
  });

  describe('findOne', () => {
    it('returns project by id', async () => {
      projectRepository.findOne.mockResolvedValue(mockProjectEntity());

      const result = await service.findOne(1);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockProjectResponse());
    });

    it('throws NotFoundException when project does not exist', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates name and description', async () => {
      const existing = mockProjectEntity();
      const updated = mockProjectEntity({
        name: 'Updated Name',
        description: 'Updated description',
      });
      const updateDto: UpdateProjectDto = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      projectRepository.findOne.mockResolvedValue(existing);
      projectRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, updateDto);

      expect(projectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          name: 'Updated Name',
          description: 'Updated description',
        }),
      );
      expect(result).toEqual(
        mockProjectResponse({
          name: 'Updated Name',
          description: 'Updated description',
        }),
      );
    });

    it('throws NotFoundException when updating a missing project', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, { name: 'Updated Name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes existing project', async () => {
      projectRepository.findOne.mockResolvedValue(mockProjectEntity());
      projectRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.remove(1);

      expect(projectRepository.softDelete).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws NotFoundException when removing a missing project', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
