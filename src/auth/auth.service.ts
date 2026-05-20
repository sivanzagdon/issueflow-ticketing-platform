import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { ExtractJwt } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { toUserResponse, UserResponse } from '../users/users.mapper';
import { JWT_EXPIRES_IN_SECONDS } from './auth.constants';
import { LoginResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { TokenDenylistService } from './token-denylist.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly tokenDenylist: TokenDenylistService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.validateUser(loginDto.username, loginDto.password);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }

  async validateUser(username: string, password: string): Promise<UserResponse> {
    const user = await this.userRepository.findOne({
      where: { username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return toUserResponse(user);
  }

  async logout(request: Request): Promise<void> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    this.tokenDenylist.invalidate(token ?? '');
  }
}
