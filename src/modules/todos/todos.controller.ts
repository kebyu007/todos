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
import { TodoStatus } from './entities/todo.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';

@Controller()
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  // Dashboard — to'liq sahifa
  @Get()
  async dashboard(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryTodosDto,
    @Res() res: Response,
  ): Promise<void> {
    // Servis allaqachon timezone bo'yicha formatlab beradi (dueAtFormatted va dueAt bilan)
    const todos = await this.todosService.findForUser(user.userId, query);

    res.render('pages/dashboard', {
      layout: 'layouts/main',
      title: 'My Tasks',
      currentUser: user,
      todos: todos, // toView() olib tashlandi, to'g'ridan-to'g'ri uzatiladi
      filter: query.filter ?? TodoFilter.ALL,
      search: query.search ?? '',
      filters: Object.values(TodoFilter),
    });
  }

  // HTMX ro'yxatni yangilash (filtrlar va qidiruv uchun)
  @Get('todos')
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryTodosDto,
    @Res() res: Response,
  ): Promise<void> {
    const todos = await this.todosService.findForUser(user.userId, query);
    res.render('partials/todo-list', {
      layout: false,
      todos: todos, // To'g'ridan-to'g'ri uzatiladi
    });
  }

  // Yangi Todo yaratish
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
        ...todo, // Formatlangan obyektni yoyib (spread) yuboramiz
      });
    }
    res.redirect('/');
  }

  // Bitta Todo-ni olish (Cancel bosilganda inline formani qayta tiklaydi)
  @Get('todos/:id')
  async one(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const todo = await this.todosService.findOneScoped(id, user);
    res.render('partials/todo-item', {
      layout: false,
      ...todo,
    });
  }

  // Inline tahrirlash formasi (HTMX qatorni ushbu formaga almashtiradi)
  // todos.controller.ts ichidagi editForm metodini shunday o'zgartiring:
  @Get('todos/:id/edit')
  async editForm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const todo = await this.todosService.findOneScoped(id, user);

    // Agar todo Mongoose hujjati bo'lsa, uni toza JS obyektiga o'giramiz
    const todoPlain = todo.toObject ? todo.toObject() : todo;

    res.render('partials/todo-edit', {
      layout: false,
      ...todoPlain, // Endi title, description va dueAt aniq Handlebars'ga o'tadi!
    });
  }

  // Todo-ni yangilash (Save bosilganda)
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
        ...todo,
      });
    }
    res.redirect('/');
  }

  // Checkbox bosilganda (Status toggle)
  @Post('todos/:id/toggle')
  async toggle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const todo = await this.todosService.toggle(id, user);
    res.render('partials/todo-item', {
      layout: false,
      ...todo,
    });
  }

  // Todo-ni o'chirish
  @Delete('todos/:id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.todosService.remove(id, user);
    this.triggerToast(res, 'info', 'Task deleted');
    res.send('');
  }

  // HTMX orqali notification chiqarish uchun trigger header
  private triggerToast(
    res: Response,
    type: 'success' | 'error' | 'info',
    message: string,
  ): void {
    res.setHeader('HX-Trigger', JSON.stringify({ toast: { type, message } }));
  }

  private isHtmx(req: Request): boolean {
    return req.headers['hx-request'] === 'true';
  }
}
