import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductRPCController } from './product-rpc.controller';

@Module({
  // controllers: [ProductController],
  providers: [ProductService, ProductRPCController]
})
export class ProductModule {}
