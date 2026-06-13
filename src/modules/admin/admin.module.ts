import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UserModule } from '../user/user.module';
import { TodosModule } from '../todos/todos.module';

// Reuses UserService + TodosService (both exported by their modules).
@Module({
  imports: [UserModule, TodosModule],
  controllers: [AdminController],
})
export class AdminModule {}
