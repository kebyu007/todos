import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as moment from 'moment-timezone'; // 1. Moment-timezone'ni qo'shdik

type Filter = Record<string, any>;
import { Todo, TodoDocument, TodoStatus } from './entities/todo.entity';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { QueryTodosDto, TodoFilter } from './dto/query-todos.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRoles, User, UserDocument } from '../user/entities/user.entity'; // 2. User modelini import qildik

@Injectable()
export class TodosService {
  constructor(
    @InjectModel(Todo.name) private readonly todoModel: Model<TodoDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>, // 3. User modelni inject qildik
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

  // Yaratishda foydalanuvchi vaqt zonasini hisobga olamiz
  async create(dto: CreateTodoDto, ownerId: string): Promise<TodoDocument> {
    const user = await this.userModel.findById(ownerId).exec();
    const timezone = user?.timezone || 'Asia/Tashkent';

    // Kelgan vaqtni foydalanuvchi zonasi bilan o'qib, UTC Date obyektiga o'giramiz
    const dueAt = dto.dueAt ? moment.tz(dto.dueAt, timezone).toDate() : null;

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

  // Dashboard ro'yxatida vaqt zonasini applyFilters'ga uzatamiz
  async findForUser(ownerId: string, query: QueryTodosDto): Promise<TodoDocument[]> {
    const user = await this.userModel.findById(ownerId).exec();
    const timezone = user?.timezone || 'Asia/Tashkent';

    const filter: Filter = {
      userId: new Types.ObjectId(ownerId),
    };
    
    this.applyFilters(filter, query, timezone); // Timezone uzatildi
    
    return this.todoModel
      .find(filter)
      .sort({ status: 1, dueAt: 1, createdAt: -1 })
      .exec();
  }

  findAll(query: QueryTodosDto): Promise<TodoDocument[]> {
    const filter: Filter = {};
    this.applyFilters(filter, query); // Admin uchun default 'Asia/Tashkent' ishlaydi
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

    const user = await this.userModel.findById(todo.userId).exec();
    const timezone = user?.timezone || 'Asia/Tashkent';

    if (dto.title !== undefined) todo.title = dto.title;
    if (dto.description !== undefined) todo.description = dto.description;
    
    if (dto.dueAt !== undefined) {
      // Yangi vaqtni foydalanuvchi zonasi bilan to'g'rilab bazaga saqlaymiz
      const newDue = dto.dueAt ? moment.tz(dto.dueAt, timezone).toDate() : null;
      
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

  private setStatus(todo: TodoDocument, status: TodoStatus): void {
    todo.status = status;
    todo.completedAt = status === TodoStatus.DONE ? new Date() : null;
  }

  // Katta o'zgarish shu yerda: TODAY filtri endi foydalanuvchi kuniga mos keladi
  private applyFilters(
    filter: Filter,
    query: QueryTodosDto,
    timezone: string = 'Asia/Tashkent', // Default qiymat qo'shildi
  ): void {
    if (query.status) filter.status = query.status;

    if (query.filter === TodoFilter.DONE) {
      filter.status = TodoStatus.DONE;
    } else if (query.filter === TodoFilter.TODAY) {
      // Foydalanuvchining local vaqti bo'yicha kunning mutloq boshi va oxirini topib UTCga o'giramiz
      const start = moment.tz(timezone).startOf('day').toDate();
      const end = moment.tz(timezone).endOf('day').toDate();
      
      filter.dueAt = { $gte: start, $lte: end };
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

  private assertCanAccess(todo: TodoDocument, actor: AuthUser): void {
    if (actor.role === UserRoles.admin) return;
    if (todo.userId.toString() !== actor.userId) {
      throw new ForbiddenException('This todo does not belong to you');
    }
  }
}