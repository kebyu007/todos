import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}
export enum TodoStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

@Schema({ _id: false })
class Reminder {
  @Prop({ required: true }) offsetMinutes: number;

  @Prop({ default: false }) sent: boolean;

  @Prop({ type: Date, default: null }) sentAt: Date | null;

  @Prop({ type: String, default: null }) jobId: string | null;
}

@Schema({ timestamps: true })
export class Todo {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  // stored in UTC
  @Prop({ type: Date, default: null, index: true })
  dueAt: Date | null;

  @Prop({ type: String, enum: Priority, default: Priority.MEDIUM })
  priority: Priority;

  @Prop({
    type: String,
    enum: TodoStatus,
    default: TodoStatus.PENDING,
    index: true,
  })
  status: TodoStatus;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [Reminder], default: [] })
  reminders: Reminder[];

  @Prop({ type: Date, default: null })
  completedAt: Date | null;
}

export type TodoDocument = HydratedDocument<Todo>;
export const TodoSchema = SchemaFactory.createForClass(Todo);

// Dashboard list & sort (owner-scoped); scheduler sweep (phase 2).
TodoSchema.index({ userId: 1, status: 1, dueAt: 1 });
