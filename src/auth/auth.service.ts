import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserResponse } from '../users/users.mapper';
import { LoginResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  login(_loginDto: LoginDto): Promise<LoginResponse> {
    throw new Error('Not implemented');
  }

  validateUser(_username: string, _password: string): Promise<UserResponse> {
    throw new Error('Not implemented');
  }

  logout(): Promise<void> {
    throw new Error('Not implemented');
  }
}
