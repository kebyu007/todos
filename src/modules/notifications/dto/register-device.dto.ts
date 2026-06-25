import { IsString, MinLength } from 'class-validator';

// The Expo push token reported by the mobile device.
export class RegisterDeviceDto {
  @IsString()
  @MinLength(1)
  token: string;
}
