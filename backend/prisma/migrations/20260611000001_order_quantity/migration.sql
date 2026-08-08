-- Multi-quantity plan purchases: an order can now buy 1-3 units of
-- selected stackable plans. Existing orders are all single-unit.
ALTER TABLE "Order" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
