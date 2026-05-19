import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { toUserResponse, UserResponse } from './users.mapper';

export type { UserResponse };

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    const plainPassword =
      createUserDto.password ?? randomBytes(32).toString('hex');
    const passwordHash = await this.hashPassword(plainPassword);

    const user = this.userRepository.create({
      username: createUserDto.username,
      email: createUserDto.email,
      fullName: createUserDto.fullName,
      role: createUserDto.role,
      passwordHash,
    });

    try {
      const saved = await this.userRepository.save(user);
      return toUserResponse(saved);
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async findAll(): Promise<UserResponse[]> {
    const users = await this.userRepository.find();
    return users.map(toUserResponse);
  }

  async findOne(id: number): Promise<UserResponse> {
    const user = await this.getUserOrThrow(id);
    return toUserResponse(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<UserResponse> {
    const user = await this.getUserOrThrow(id);

    if (updateUserDto.fullName !== undefined) {
      user.fullName = updateUserDto.fullName;
    }
    if (updateUserDto.role !== undefined) {
      user.role = updateUserDto.role;
    }

    try {
      const saved = await this.userRepository.save(user);
      return toUserResponse(saved);
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async remove(id: number): Promise<void> {
    await this.getUserOrThrow(id);
    await this.userRepository.delete({ id });
  }

  private async getUserOrThrow(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  private async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  private handlePersistenceError(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string })?.code === '23505'
    ) {
      throw new ConflictException('User with this username or email already exists');
    }
    throw error;
  }
}
