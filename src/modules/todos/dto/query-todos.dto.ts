import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TodoStatus } from '../entities/todo.entity';

// Dashboard filter tabs: all | today | upcoming | done (+ raw status).
export enum TodoFilter {
  ALL = 'all',
  TODAY = 'today',
  UPCOMING = 'upcoming',
  DONE = 'done',
}

export class QueryTodosDto {
  @IsOptional()
  @IsEnum(TodoFilter)
  filter?: TodoFilter;

  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
