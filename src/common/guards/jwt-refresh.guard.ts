import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Applied only to POST /auth/refresh; validates the `refresh_token` cookie.
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
