import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('tickets/:ticketId/comments')
  create(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    return this.commentsService.create(ticketId, createCommentDto);
  }

  @Get('tickets/:ticketId/comments')
  findByTicket(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.commentsService.findByTicket(ticketId);
  }

  @Patch('tickets/:ticketId/comments/:commentId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() updateCommentDto: UpdateCommentDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.commentsService.update(
      ticketId,
      commentId,
      updateCommentDto,
      req.user.id,
    );
  }

  @Delete('tickets/:ticketId/comments/:commentId')
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.commentsService.remove(ticketId, commentId, req.user.id);
  }
}
