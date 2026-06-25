import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TodosService } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { QueryTodosDto } from './dto/query-todos.dto';
import { SnoozeDto } from './dto/snooze.dto';
import { TodoDocument, TodoStatus } from './entities/todo.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';

// Plain JSON shape sent to the mobile app. dueAt/timestamps are UTC ISO
// strings so the client can format them in the user's timezone.
export interface TodoApi {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  isDone: boolean;
  tags: string[];
  dueAt: string | null;
  reminders: {
    offsetMinutes: number;
    sent: boolean;
    sentAt: string | null;
    remindAt: string | null;
  }[];
  createdAt: string | null;
  updatedAt: string | null;
}

export function serializeTodo(todo: TodoDocument): TodoApi {
  const doc = todo as TodoDocument & { createdAt?: Date; updatedAt?: Date };
  return {
    id: todo._id.toString(),
    title: todo.title,
    description: todo.description,
    priority: todo.priority,
    status: todo.status,
    isDone: todo.status === TodoStatus.DONE,
    tags: todo.tags ?? [],
    dueAt: todo.dueAt ? todo.dueAt.toISOString() : null,
    reminders: (todo.reminders ?? []).map((r) => ({
      offsetMinutes: r.offsetMinutes,
      sent: r.sent,
      sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
      remindAt: r.remindAt ? new Date(r.remindAt).toISOString() : null,
    })),
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : null,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
  };
}

@Controller('api/todos')
export class TodosApiController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryTodosDto,
  ): Promise<TodoApi[]> {
    const todos = await this.todosService.apiList(user.userId, query);
    return todos.map(serializeTodo);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTodoDto,
  ): Promise<TodoApi> {
    const todo = await this.todosService.apiCreate(dto, user.userId);
    return serializeTodo(todo);
  }

  @Get(':id')
  async one(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<TodoApi> {
    return serializeTodo(await this.todosService.apiFindOne(id, user));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ): Promise<TodoApi> {
    return serializeTodo(await this.todosService.apiUpdate(id, dto, user));
  }

  @Post(':id/toggle')
  @HttpCode(200)
  async toggle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<TodoApi> {
    return serializeTodo(await this.todosService.apiToggle(id, user));
  }

  @Post(':id/snooze')
  @HttpCode(200)
  async snooze(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SnoozeDto,
  ): Promise<{ remindAt: string; todo: TodoApi }> {
    const { remindAt, todo } = await this.todosService.snooze(
      id,
      dto.minutes,
      user,
    );
    return { remindAt: remindAt.toISOString(), todo: serializeTodo(todo) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.todosService.remove(id, user);
  }
}
