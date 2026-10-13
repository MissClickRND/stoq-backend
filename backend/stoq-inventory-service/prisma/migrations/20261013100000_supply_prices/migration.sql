ALTER TABLE supply.supplies ADD COLUMN supplier TEXT, ADD COLUMN total_price DECIMAL(18,2);
ALTER TABLE supply.supply_items ADD COLUMN total_price DECIMAL(18,2);
ALTER TABLE inventory.batches ADD COLUMN price DECIMAL(18,6);
ALTER TABLE supply.supplies ADD CONSTRAINT supplies_total_price_nonnegative CHECK (total_price >= 0);
ALTER TABLE supply.supply_items ADD CONSTRAINT supply_items_total_price_nonnegative CHECK (total_price >= 0);
ALTER TABLE inventory.batches ADD CONSTRAINT batches_price_nonnegative CHECK (price >= 0);
