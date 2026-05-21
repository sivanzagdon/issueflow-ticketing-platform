import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditActor } from '../common/enums/audit-actor.enum';
import { AuditEntityType } from '../common/enums/audit-entity-type.enum';
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
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    createProjectDto: CreateProjectDto,
    performedBy?: number,
  ): Promise<ProjectResponse> {
    await this.usersService.findOne(createProjectDto.ownerId);

    const project = this.projectRepository.create({
      name: createProjectDto.name,
      description: createProjectDto.description,
      ownerId: createProjectDto.ownerId,
    });
    const saved = await this.projectRepository.save(project);

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: AuditEntityType.PROJECT,
      entityId: saved.id,
      performedBy: performedBy ?? createProjectDto.ownerId,
      actorType: AuditActor.USER,
      details: {
        name: saved.name,
        ownerId: saved.ownerId,
      },
    });

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
    performedBy?: number,
  ): Promise<ProjectResponse> {
    const project = await this.getProjectOrThrow(id);
    const before = { name: project.name, description: project.description };

    if (updateProjectDto.name !== undefined) {
      project.name = updateProjectDto.name;
    }
    if (updateProjectDto.description !== undefined) {
      project.description = updateProjectDto.description;
    }

    const saved = await this.projectRepository.save(project);
    const details: Record<string, unknown> = {};
    if (updateProjectDto.name !== undefined && updateProjectDto.name !== before.name) {
      details.name = { before: before.name, after: saved.name };
    }
    if (
      updateProjectDto.description !== undefined &&
      updateProjectDto.description !== before.description
    ) {
      details.description = {
        before: before.description,
        after: saved.description,
      };
    }

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.PROJECT,
      entityId: saved.id,
      performedBy: performedBy ?? saved.ownerId,
      actorType: AuditActor.USER,
      details: Object.keys(details).length > 0 ? details : null,
    });

    return toProjectResponse(saved);
  }

  async remove(id: number, performedBy?: number): Promise<void> {
    const project = await this.getProjectOrThrow(id);
    await this.projectRepository.softDelete({ id });
    await this.auditLogService.record({
      action: AuditAction.DELETE,
      entityType: AuditEntityType.PROJECT,
      entityId: id,
      performedBy: performedBy ?? project.ownerId,
      actorType: AuditActor.USER,
    });
  }

  private async getProjectOrThrow(id: number): Promise<Project> {
    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }
}
