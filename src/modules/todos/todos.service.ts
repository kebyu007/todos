import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

// Mongoose's FilterQuery isn't re-exported cleanly under nodenext resolution,
// so we use a plain object shape for the query builder.
type Filter = Record<string, any>;
import { Todo, TodoDocument, TodoStatus } from './entities/todo.entity';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { QueryTodosDto, TodoFilter } from './dto/query-todos.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRoles } from '../user/entities/user.entity';

@Injectable()
export class TodosService {
  constructor(
    @InjectModel(Todo.name) private readonly todoModel: Model<TodoDocument>,
  ) {}

  // Reminder offsets (minutes before dueAt): 1h before, then at due time.
  private static readonly REMINDER_OFFSETS = [60, 0];

  private defaultReminders(dueAt: Date | null) {
    if (!dueAt) return [];
    return TodosService.REMINDER_OFFSETS.map((offsetMinutes) => ({
      offsetMinutes,
      sent: false,
      sentAt: null,
      jobId: null,
    }));
  }

  create(dto: CreateTodoDto, ownerId: string): Promise<TodoDocument> {
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    return this.todoModel.create({
      userId: new Types.ObjectId(ownerId),
      title: dto.title,
      description: dto.description ?? '',
      dueAt,
      priority: dto.priority,
      status: dto.status,
      tags: dto.tags ?? [],
      reminders: this.defaultReminders(dueAt),
    });
  }

  // Owner-scoped list for the dashboard, with filter tabs + search.
  findForUser(ownerId: string, query: QueryTodosDto): Promise<TodoDocument[]> {
    const filter: Filter = {
      userId: new Types.ObjectId(ownerId),
    };
    this.applyFilters(filter, query);
    return this.todoModel
      .find(filter)
      .sort({ status: 1, dueAt: 1, createdAt: -1 })
      .exec();
  }

  // Admin-only: every todo across all users, with owner info populated.
  findAll(query: QueryTodosDto): Promise<TodoDocument[]> {
    const filter: Filter = {};
    this.applyFilters(filter, query);
    return this.todoModel
      .find(filter)
      .populate('userId', 'email username')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOneScoped(id: string, actor: AuthUser): Promise<TodoDocument> {
    const todo = await this.getOrFail(id);
    this.assertCanAccess(todo, actor);
    return todo;
  }

  // Active, dated todos that still have at least one un-sent reminder — the
  // candidate set the notification scheduler sweeps every minute.
  findDueReminderTodos(): Promise<TodoDocument[]> {
    return this.todoModel
      .find({
        dueAt: { $ne: null },
        status: { $ne: TodoStatus.DONE },
        reminders: { $elemMatch: { sent: false } },
      })
      .exec();
  }

  async update(
    id: string,
    dto: UpdateTodoDto,
    actor: AuthUser,
  ): Promise<TodoDocument> {
    const todo = await this.getOrFail(id);
    this.assertCanAccess(todo, actor);

    if (dto.title !== undefined) todo.title = dto.title;
    if (dto.description !== undefined) todo.description = dto.description;
    if (dto.dueAt !== undefined) {
      const newDue = dto.dueAt ? new Date(dto.dueAt) : null;
      // Reschedule reminders whenever the due date actually changes.
      if (newDue?.getTime() !== todo.dueAt?.getTime()) {
        todo.dueAt = newDue;
        todo.reminders = this.defaultReminders(newDue) as never;
      }
    }
    if (dto.priority !== undefined) todo.priority = dto.priority;
    if (dto.tags !== undefined) todo.tags = dto.tags;
    if (dto.status !== undefined) this.setStatus(todo, dto.status);

    return todo.save();
  }

  async toggle(id: string, actor: AuthUser): Promise<TodoDocument> {
    const todo = await this.getOrFail(id);
    this.assertCanAccess(todo, actor);
    const next =
      todo.status === TodoStatus.DONE ? TodoStatus.PENDING : TodoStatus.DONE;
    this.setStatus(todo, next);
    return todo.save();
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const todo = await this.getOrFail(id);
    this.assertCanAccess(todo, actor);
    await todo.deleteOne();
  }

  // ---- internals ----

  private setStatus(todo: TodoDocument, status: TodoStatus): void {
    todo.status = status;
    todo.completedAt = status === TodoStatus.DONE ? new Date() : null;
  }

  private applyFilters(
    filter: Filter,
    query: QueryTodosDto,
  ): void {
    if (query.status) filter.status = query.status;

    if (query.filter === TodoFilter.DONE) {
      filter.status = TodoStatus.DONE;
    } else if (query.filter === TodoFilter.TODAY) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.dueAt = { $gte: start, $lt: end };
    } else if (query.filter === TodoFilter.UPCOMING) {
      filter.dueAt = { $gte: new Date() };
      filter.status = { $ne: TodoStatus.DONE };
    }

    if (query.search) {
      filter.title = { $regex: query.search.trim(), $options: 'i' };
    }
  }

  private async getOrFail(id: string): Promise<TodoDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Todo not found');
    }
    const todo = await this.todoModel.findById(id).exec();
    if (!todo) throw new NotFoundException('Todo not found');
    return todo;
  }

  // Owner can touch their own todos; admin can touch anyone's.
  private assertCanAccess(todo: TodoDocument, actor: AuthUser): void {
    if (actor.role === UserRoles.admin) return;
    if (todo.userId.toString() !== actor.userId) {
      throw new ForbiddenException('This todo does not belong to you');
    }
  }
}
