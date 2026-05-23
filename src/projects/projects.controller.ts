import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(
    @Body() createProjectDto: CreateProjectDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.projectsService.create(createProjectDto, req.user.id);
  }

  @Get('deleted')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllDeleted() {
    return this.projectsService.findAllDeleted();
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Post(':projectId/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  restore(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.projectsService.restore(projectId, req.user.id);
  }

  @Get(':projectId')
  findOne(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.findOne(projectId);
  }

  @Patch(':projectId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() updateProjectDto: UpdateProjectDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.projectsService.update(projectId, updateProjectDto, req.user.id);
  }

  @Delete(':projectId')
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.projectsService.remove(projectId, req.user.id);
  }
}
