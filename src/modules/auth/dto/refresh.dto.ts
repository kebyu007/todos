import { IsString, MinLength } from 'class-validator';

// Mobile refresh: the refresh token travels in the body (no cookies on native).
export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken: string;
}
