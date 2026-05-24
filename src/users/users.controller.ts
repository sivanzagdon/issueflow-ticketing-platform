import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { MentionsQueryDto } from './dto/mentions-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':userId/mentions')
  findMentionsForUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: MentionsQueryDto,
  ) {
    return this.usersService.findMentionsForUser(userId, query);
  }

  @Get(':userId')
  findOne(@Param('userId', ParseIntPipe) userId: number) {
    return this.usersService.findOne(userId);
  }

  @Public()
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Post('update/:userId')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.usersService.update(userId, updateUserDto, req.user.id);
  }

  @Delete(':userId')
  remove(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.usersService.remove(userId, req.user.id);
  }
}
