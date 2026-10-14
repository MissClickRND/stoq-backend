import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersRPCController } from './orders-rpc.controller';
import { CommandBusModule } from '../common/rabbitMQ/command-bus.module';
import { OrderEventPublisher } from './order-event.publisher';

@Module({
  imports: [CommandBusModule],
  providers: [OrdersService, OrdersRPCController, OrderEventPublisher],
  // controllers: [OrdersController],
})
export class OrdersModule {}
