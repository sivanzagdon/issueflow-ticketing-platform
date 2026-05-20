import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';

export type ProjectResponse = Pick<
  Project,
  'id' | 'name' | 'description' | 'ownerId'
>;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  create(_createProjectDto: CreateProjectDto): Promise<ProjectResponse> {
    throw new Error('Not implemented');
  }

  findAll(): Promise<ProjectResponse[]> {
    throw new Error('Not implemented');
  }

  findOne(_id: number): Promise<ProjectResponse> {
    throw new Error('Not implemented');
  }

  update(
    _id: number,
    _updateProjectDto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    throw new Error('Not implemented');
  }

  remove(_id: number): Promise<void> {
    throw new Error('Not implemented');
  }
}
