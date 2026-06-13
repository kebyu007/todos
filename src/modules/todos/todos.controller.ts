import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TodosService } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { QueryTodosDto, TodoFilter } from './dto/query-todos.dto';
import { TodoDocument, TodoStatus } from './entities/todo.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';

@Controller()
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  // Dashboard — full page.
  @Get()
  async dashboard(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryTodosDto,
    @Res() res: Response,
  ): Promise<void> {
    const todos = await this.todosService.findForUser(user.userId, query);
    res.render('pages/dashboard', {
      layout: 'layouts/main',
      title: 'My Tasks',
      currentUser: user,
      todos: todos.map((t) => this.toView(t)),
      filter: query.filter ?? TodoFilter.ALL,
      search: query.search ?? '',
      filters: Object.values(TodoFilter),
    });
  }

  // HTMX list refresh (filter tabs / search) — returns just the list partial.
  @Get('todos')
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryTodosDto,
    @Res() res: Response,
  ): Promise<void> {
    const todos = await this.todosService.findForUser(user.userId, query);
    res.render('partials/todo-list', {
      layout: false,
      todos: todos.map((t) => this.toView(t)),
    });
  }

  @Post('todos')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTodoDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const todo = await this.todosService.create(dto, user.userId);
    if (this.isHtmx(req)) {
      this.triggerToast(res, 'success', 'Task added');
      return res.render('partials/todo-item', {
        layout: false,
        ...this.toView(todo),
      });
    }
    res.redirect('/');
  }

  // Single-item view (used to cancel inline edits — swaps the form back).
  @Get('todos/:id')
  async one(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const todo = await this.todosService.findOneScoped(id, user);
    res.render('partials/todo-item', { layout: false, ...this.toView(todo) });
  }

  // Inline edit form (HTMX swaps the row for this form).
  @Get('todos/:id/edit')
  async editForm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const todo = await this.todosService.findOneScoped(id, user);
    res.render('partials/todo-edit', {
      layout: false,
      ...this.toView(todo),
    });
  }

  @Patch('todos/:id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const todo = await this.todosService.update(id, dto, user);
    if (this.isHtmx(req)) {
      return res.render('partials/todo-item', {
        layout: false,
        ...this.toView(todo),
      });
    }
    res.redirect('/');
  }

  @Post('todos/:id/toggle')
  async toggle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const todo = await this.todosService.toggle(id, user);
    res.render('partials/todo-item', { layout: false, ...this.toView(todo) });
  }

  @Delete('todos/:id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.todosService.remove(id, user);
    // Empty body → HTMX removes the swapped element.
    this.triggerToast(res, 'info', 'Task deleted');
    res.send('');
  }

  // Fires a client-side toast via HTMX's HX-Trigger header (success responses).
  private triggerToast(
    res: Response,
    type: 'success' | 'error' | 'info',
    message: string,
  ): void {
    res.setHeader('HX-Trigger', JSON.stringify({ toast: { type, message } }));
  }

  // Maps a Mongo document to the flat shape the HBS partials expect.
  private toView(todo: TodoDocument) {
    return {
      id: todo._id.toString(),
      title: todo.title,
      description: todo.description,
      priority: todo.priority,
      status: todo.status,
      isDone: todo.status === TodoStatus.DONE,
      dueAt: todo.dueAt,
      tags: todo.tags,
    };
  }

  private isHtmx(req: Request): boolean {
    return req.headers['hx-request'] === 'true';
  }
}
