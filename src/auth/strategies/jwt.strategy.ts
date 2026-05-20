import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { jwtSecret } from '../auth.constants';
import { AuthenticatedUser, JwtPayload } from '../auth.types';
import { TokenDenylistService } from '../token-denylist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenDenylist: TokenDenylistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (this.tokenDenylist.isInvalidated(token)) {
      throw new UnauthorizedException('Token has been invalidated');
    }
    return this.usersService.findOne(payload.sub);
  }
}
