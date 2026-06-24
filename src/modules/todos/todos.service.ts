import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as moment from 'moment-timezone';

type Filter = Record<string, any>;
import { Todo, TodoDocument, TodoStatus } from './entities/todo.entity';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { QueryTodosDto, TodoFilter } from './dto/query-todos.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRoles, User, UserDocument } from '../user/entities/user.entity';

@Injectable()
export class TodosService {
  constructor(
    @InjectModel(Todo.name) private readonly todoModel: Model<TodoDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

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

  // Helper: Mongoose hujjatini HBS va HTMX uchun tayyorlab beradi
  private formatTodoWithTimezone(todo: any, timezone: string): any {
    if (!todo) return null;

    // 1. Obyektni toza JS obyektiga aylantirish
    const doc = todo.toObject ? todo.toObject() : todo;

    // 2. Sana formatlarini aniq hisoblash
    let formatted = '';
    let iso: null | string = null;

    if (doc.dueAt) {
      const localMoment = moment.tz(doc.dueAt, timezone);
      formatted = localMoment.format('DD.MM.YYYY, HH:mm');
      iso = localMoment.format('YYYY-MM-DD HH:mm');; // Input uchun eng xavfsiz format
    }

    // 3. Obyektni qat'iy qaytarish (Hech qanday "shadow" maydonlarsiz)
    return {
      id: doc._id ? doc._id.toString() : doc.id,
      title: doc.title,
      description: doc.description,
      priority: doc.priority,
      status: doc.status,
      tags: doc.tags,
      isDone: doc.status === 'done',
      dueAtFormatted: formatted, // <-- Dashboard uchun
      dueAt: iso, // <-- Edit uchun
    };
  }

  // 1. Yangi To'do yaratish (HTMX daxshbord ro'yxatiga darhol qo'shilishi uchun formatlangan)
  async create(dto: CreateTodoDto, ownerId: string): Promise<any> {
    const user = await this.userModel.findById(ownerId).exec();
    const timezone = user?.timezone || 'Asia/Tashkent';

    const dueAt = dto.dueAt ? moment.tz(dto.dueAt, timezone).toDate() : null;

    const createdTodo = await this.todoModel.create({
      userId: new Types.ObjectId(ownerId),
      title: dto.title,
      description: dto.description ?? '',
      dueAt,
      priority: dto.priority,
      status: dto.status,
      tags: dto.tags ?? [],
      reminders: this.defaultReminders(dueAt),
    });

    return this.formatTodoWithTimezone(createdTodo, timezone);
  }

  // 2. Foydalanuvchi daxshbord ro'yxati (Asosiy sahifaga kirganda)
  async findForUser(ownerId: string, query: QueryTodosDto): Promise<any[]> {
    const user = await this.userModel.findById(ownerId).exec();
    const timezone = user?.timezone || 'Asia/Tashkent';

    const filter: Filter = {
      userId: new Types.ObjectId(ownerId),
    };

    this.applyFilters(filter, query, timezone);

    const todos = await this.todoModel
      .find(filter)
      .sort({ status: 1, dueAt: 1, createdAt: -1 })
      .exec();

    return todos.map((todo) => this.formatTodoWithTimezone(todo, timezone));
  }

  // 3. Bitta To'doni olish (Cancel bosilganda qayta tiklanish xatolarini oldini oladi)
  async findOneScoped(id: string, actor: AuthUser): Promise<any> {
    const todo = await this.getOrFail(id);
    this.assertCanAccess(todo, actor);

    const user = await this.userModel.findById(actor.userId).exec();
    const timezone = user?.timezone || 'Asia/Tashkent';

    return this.formatTodoWithTimezone(todo, timezone);
  }

  // 4. To'doni yangilash (Save bosilganda vaqt yo'qolmaydi)
  async update(id: string, dto: UpdateTodoDto, actor: AuthUser): Promise<any> {
    const todo = await this.getOrFail(id);
    this.assertCanAccess(todo, actor);

    const user = await this.userModel.findById(todo.userId).exec();
    const timezone = user?.timezone || 'Asia/Tashkent';

    if (dto.title !== undefined) todo.title = dto.title;
    if (dto.description !== undefined) todo.description = dto.description;

    if (dto.dueAt !== undefined) {
      const newDue = dto.dueAt ? moment.tz(dto.dueAt, timezone).toDate() : null;
      if (newDue?.getTime() !== todo.dueAt?.getTime()) {
        todo.dueAt = newDue;
        todo.reminders = this.defaultReminders(newDue) as any;
      }
    }
    if (dto.priority !== undefined) todo.priority = dto.priority;
    if (dto.tags !== undefined) todo.tags = dto.tags;
    if (dto.status !== undefined) this.setStatus(todo, dto.status);

    const savedTodo = await todo.save();
    return this.formatTodoWithTimezone(savedTodo, timezone);
  }

  // 5. Checkbox bosilganda (Status toggle holati)
  async toggle(id: string, actor: AuthUser): Promise<any> {
    const todo = await this.getOrFail(id);
    this.assertCanAccess(todo, actor);

    const user = await this.userModel.findById(actor.userId).exec();
    const timezone = user?.timezone || 'Asia/Tashkent';

    const next =
      todo.status === TodoStatus.DONE ? TodoStatus.PENDING : TodoStatus.DONE;
    this.setStatus(todo, next);

    const savedTodo = await todo.save();
    return this.formatTodoWithTimezone(savedTodo, timezone);
  }

  // 6. To'doni o'chirish
  async remove(id: string, actor: AuthUser): Promise<void> {
    const todo = await this.getOrFail(id);
    this.assertCanAccess(todo, actor);
    await todo.deleteOne();
  }

  // =========================================================================
  // BO'SHTA SERVISLAR VA SISTEMAVIY METODLAR (Aslidek qoldi, xalaqit qilinmadi)
  // =========================================================================

  findAll(query: QueryTodosDto): Promise<TodoDocument[]> {
    const filter: Filter = {};
    this.applyFilters(filter, query);
    return this.todoModel
      .find(filter)
      .populate('userId', 'email username')
      .sort({ createdAt: -1 })
      .exec();
  }

  findDueReminderTodos(): Promise<TodoDocument[]> {
    return this.todoModel
      .find({
        dueAt: { $ne: null },
        status: { $ne: TodoStatus.DONE },
        reminders: { $elemMatch: { sent: false } },
      })
      .exec();
  }

  private setStatus(todo: TodoDocument, status: TodoStatus): void {
    todo.status = status;
    todo.completedAt = status === TodoStatus.DONE ? new Date() : null;
  }

  private applyFilters(
    filter: Filter,
    query: QueryTodosDto,
    timezone: string = 'Asia/Tashkent',
  ): void {
    if (query.status) filter.status = query.status;

    if (query.filter === TodoFilter.DONE) {
      filter.status = TodoStatus.DONE;
    } else if (query.filter === TodoFilter.TODAY) {
      const start = moment.tz(timezone).startOf('day').toDate();
      const end = moment.tz(timezone).endOf('day').toDate();
      filter.dueAt = { $gte: start, $lte: end };
    } // todos.service.ts -> applyFilters() ichidagi qismni shunga o'zgartiring:
    else if (query.filter === TodoFilter.UPCOMING) {
      filter.dueAt = { $gte: moment.tz(timezone).toDate() }; // AWS UTC vaqti emas, foydalanuvchi "hozirgi" vaqti
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

  private assertCanAccess(todo: TodoDocument, actor: AuthUser): void {
    if (actor.role === UserRoles.admin) return;
    if (todo.userId.toString() !== actor.userId) {
      throw new ForbiddenException('This todo does not belong to you');
    }
  }
}
