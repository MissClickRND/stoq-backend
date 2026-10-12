/*
  Warnings:

  - You are about to drop the column `shelf_life_days` on the `supply_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "supply"."supply_items" DROP COLUMN "shelf_life_days";
