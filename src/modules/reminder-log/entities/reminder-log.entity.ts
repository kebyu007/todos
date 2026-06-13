import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class ReminderLog {
  @Prop({ type: Types.ObjectId, ref: 'Todo', index: true })
  todoId: Types.ObjectId;
  
  @Prop({ type: Types.ObjectId, ref: 'User' }) 
  userId: Types.ObjectId;
  
  @Prop() 
  offsetMinutes: number;

  @Prop() 
  deliveredAt: Date;

  @Prop({ default: 'telegram' }) 
  channel: string;
}

export const ReminderLogSchema = SchemaFactory.createForClass(ReminderLog);

ReminderLogSchema.index({ todoId: 1, offsetMinutes: 1 }, { unique: true });
