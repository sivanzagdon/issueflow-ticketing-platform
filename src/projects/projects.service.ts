import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';
import { ProjectResponse, toProjectResponse } from './projects.mapper';

export type { ProjectResponse };

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly usersService: UsersService,
  ) {}

  async create(createProjectDto: CreateProjectDto): Promise<ProjectResponse> {
    await this.usersService.findOne(createProjectDto.ownerId);

    const project = this.projectRepository.create({
      name: createProjectDto.name,
      description: createProjectDto.description,
      ownerId: createProjectDto.ownerId,
    });
    const saved = await this.projectRepository.save(project);
    return toProjectResponse(saved);
  }

  async findAll(): Promise<ProjectResponse[]> {
    const projects = await this.projectRepository.find();
    return projects.map(toProjectResponse);
  }

  async findOne(id: number): Promise<ProjectResponse> {
    const project = await this.getProjectOrThrow(id);
    return toProjectResponse(project);
  }

  async update(
    id: number,
    updateProjectDto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    const project = await this.getProjectOrThrow(id);

    if (updateProjectDto.name !== undefined) {
      project.name = updateProjectDto.name;
    }
    if (updateProjectDto.description !== undefined) {
      project.description = updateProjectDto.description;
    }

    const saved = await this.projectRepository.save(project);
    return toProjectResponse(saved);
  }

  async remove(id: number): Promise<void> {
    await this.getProjectOrThrow(id);
    await this.projectRepository.delete({ id });
  }

  private async getProjectOrThrow(id: number): Promise<Project> {
    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }
}
