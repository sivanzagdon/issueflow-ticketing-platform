import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

export type UserResponse = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  create(_createUserDto: CreateUserDto): Promise<UserResponse> {
    throw new Error('Not implemented');
  }

  findAll(): Promise<UserResponse[]> {
    throw new Error('Not implemented');
  }

  findOne(_id: number): Promise<UserResponse> {
    throw new Error('Not implemented');
  }

  update(_id: number, _updateUserDto: UpdateUserDto): Promise<UserResponse> {
    throw new Error('Not implemented');
  }

  remove(_id: number): Promise<void> {
    throw new Error('Not implemented');
  }
}
