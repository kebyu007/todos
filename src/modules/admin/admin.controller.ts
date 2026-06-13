import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Render,
  UseGuards,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { TodosService } from '../todos/todos.service';
import { UpdateUserDto } from '../user/dto/update-user.dto';
import { QueryTodosDto } from '../todos/dto/query-todos.dto';
import { TodoStatus } from '../todos/entities/todo.entity';
import { UserRoles } from '../user/entities/user.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';

// Every route here requires the admin role (global JwtAuthGuard + RolesGuard).
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(UserRoles.admin)
export class AdminController {
  constructor(
    private readonly userService: UserService,
    private readonly todosService: TodosService,
  ) {}

  @Get()
  @Render('pages/admin/dashboard')
  async dashboard(@CurrentUser() current: AuthUser) {
    const [users, todos] = await Promise.all([
      this.userService.findAll(),
      this.todosService.findAll({}),
    ]);
    return {
      layout: 'layouts/main',
      title: 'Admin · Overview',
      currentUser: current,
      isAdmin: true,
      stats: {
        users: users.length,
        todos: todos.length,
        done: todos.filter((t) => t.status === TodoStatus.DONE).length,
        admins: users.filter((u) => u.role === UserRoles.admin).length,
      },
      recentUsers: users.slice(0, 5),
      recentTodos: todos.slice(0, 5).map((t) => this.toAdminTodoView(t)),
    };
  }

  // ---- Users ----
  @Get('users')
  @Render('pages/admin/users')
  async users(@CurrentUser() current: AuthUser) {
    const users = await this.userService.findAll();
    return {
      layout: 'layouts/main',
      title: 'Admin · Users',
      currentUser: current,
      isAdmin: true,
      roles: Object.values(UserRoles),
      users: users.map((u) => ({
        id: u._id.toString(),
        email: u.email,
        username: u.username,
        role: u.role,
        timezone: u.timezone,
        notificationsEnabled: u.notificationsEnabled,
        isSelf: u._id.toString() === current.userId,
      })),
    };
  }

  @Post('users/:id')
  @Redirect('/admin/users')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    await this.userService.update(id, dto);
    return { url: '/admin/users' };
  }

  @Post('users/:id/delete')
  @Redirect('/admin/users')
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser('userId') currentId: string,
  ) {
    // Guard against an admin deleting their own account.
    if (id !== currentId) {
      await this.userService.remove(id);
    }
    return { url: '/admin/users' };
  }

  // ---- Todos (across all users) ----
  @Get('todos')
  @Render('pages/admin/todos')
  async todos(@CurrentUser() current: AuthUser, @Query() query: QueryTodosDto) {
    const todos = await this.todosService.findAll(query);
    return {
      layout: 'layouts/main',
      title: 'Admin · Todos',
      currentUser: current,
      isAdmin: true,
      todos: todos.map((t) => this.toAdminTodoView(t)),
    };
  }

  @Post('todos/:id/toggle')
  @Redirect('/admin/todos')
  async toggleTodo(@Param('id') id: string, @CurrentUser() current: AuthUser) {
    await this.todosService.toggle(id, current);
    return { url: '/admin/todos' };
  }

  @Post('todos/:id/delete')
  @Redirect('/admin/todos')
  async deleteTodo(@Param('id') id: string, @CurrentUser() current: AuthUser) {
    await this.todosService.remove(id, current);
    return { url: '/admin/todos' };
  }

  private toAdminTodoView(todo: any) {
    const owner = todo.userId; // populated with email/username
    return {
      id: todo._id.toString(),
      title: todo.title,
      status: todo.status,
      priority: todo.priority,
      isDone: todo.status === TodoStatus.DONE,
      dueAt: todo.dueAt,
      ownerEmail: owner?.email ?? '—',
      ownerName: owner?.username ?? '—',
    };
  }
}
