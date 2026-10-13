CREATE TYPE "OrderStatus" AS ENUM ('created','pending_reservation','confirmed','rejected','cancelled','completed');
CREATE TABLE "Order" (
  id SERIAL NOT NULL, status "OrderStatus" NOT NULL DEFAULT 'created',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY (id)
);
CREATE TABLE "OrderItem" (
  id SERIAL NOT NULL, "orderId" INTEGER NOT NULL, "dishId" INTEGER NOT NULL, quantity INTEGER NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id)
);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
