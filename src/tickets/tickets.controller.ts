import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { AddTicketDependencyDto } from './dto/add-ticket-dependency.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ticketAttachmentUploadValidators } from './ticket-attachment-upload.config';
import { TicketsService } from './tickets.service';

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(
    @Body() createTicketDto: CreateTicketDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.ticketsService.create(createTicketDto, req.user.id);
  }

  @Get('deleted')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllDeleted(@Query('projectId', ParseIntPipe) projectId: number) {
    return this.ticketsService.findAllDeleted(projectId);
  }

  @Get()
  findAll(@Query('projectId', ParseIntPipe) projectId: number) {
    return this.ticketsService.findAll(projectId);
  }

  @Post(':ticketId/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  restore(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.ticketsService.restore(ticketId, req.user.id);
  }

  @Post(':ticketId/dependencies')
  @HttpCode(HttpStatus.OK)
  addDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AddTicketDependencyDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.ticketsService.addDependency(
      ticketId,
      dto.blockedBy,
      req.user.id,
    );
  }

  @Get(':ticketId/dependencies')
  getDependencies(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.getDependencies(ticketId);
  }

  @Delete(':ticketId/dependencies/:blockerId')
  @HttpCode(HttpStatus.OK)
  removeDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('blockerId', ParseIntPipe) blockerId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.ticketsService.removeDependency(
      ticketId,
      blockerId,
      req.user.id,
    );
  }

  @Post(':ticketId/attachments')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  createAttachment(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @UploadedFile(
      new ParseFilePipe({
        validators: ticketAttachmentUploadValidators(),
      }),
    )
    file: Express.Multer.File,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.ticketsService.createAttachment(ticketId, file, req.user.id);
  }

  @Get(':ticketId/attachments')
  getAttachments(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.getAttachments(ticketId);
  }

  @Delete(':ticketId/attachments/:attachmentId')
  @HttpCode(HttpStatus.OK)
  removeAttachment(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.ticketsService.removeAttachment(
      ticketId,
      attachmentId,
      req.user.id,
    );
  }

  @Get(':ticketId')
  findOne(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.findOne(ticketId);
  }

  @Patch(':ticketId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() updateTicketDto: UpdateTicketDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.ticketsService.update(ticketId, updateTicketDto, req.user.id);
  }

  @Delete(':ticketId')
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.ticketsService.remove(ticketId, req.user.id);
  }
}
