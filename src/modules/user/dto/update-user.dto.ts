import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

// Coerces an HTML checkbox into a boolean. The hidden-input trick sends
// ["false"] when unchecked and ["false","true"] when checked, so take the last.
const toBool = ({ value }: { value: unknown }): boolean => {
  const v = Array.isArray(value) ? value[value.length - 1] : value;
  return v === true || v === 'true' || v === 'on';
};

// Password is optional on update — only re-hashed when provided.
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  notificationsEnabled?: boolean;
}
