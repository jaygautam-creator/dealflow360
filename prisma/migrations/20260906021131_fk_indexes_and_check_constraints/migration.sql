-- CreateIndex
CREATE INDEX "BillingSchedule_lineId_idx" ON "BillingSchedule"("lineId");

-- CreateIndex
CREATE INDEX "BillingSchedule_planId_idx" ON "BillingSchedule"("planId");

-- CreateIndex
CREATE INDEX "FulfillmentAllocation_lineId_idx" ON "FulfillmentAllocation"("lineId");

-- CreateIndex
CREATE INDEX "FulfillmentAllocation_productId_idx" ON "FulfillmentAllocation"("productId");

-- CreateIndex
CREATE INDEX "FulfillmentAllocation_warehouseId_idx" ON "FulfillmentAllocation"("warehouseId");

-- CreateIndex
CREATE INDEX "PriceListItem_productId_idx" ON "PriceListItem"("productId");

-- CreateIndex
CREATE INDEX "Product_defaultPlanId_idx" ON "Product"("defaultPlanId");

-- CreateIndex
CREATE INDEX "QuotationLine_variantId_idx" ON "QuotationLine"("variantId");

-- CreateIndex
CREATE INDEX "QuotationLine_planId_idx" ON "QuotationLine"("planId");


-- ── Domain invariants, enforced by the database ──────────────────────────────
--
-- Every rule below is already checked by Zod at the API boundary. These exist because
-- validation in the application is a promise about the code paths that exist today, while
-- a CHECK constraint is a promise about the data. A direct SQL session, a future endpoint
-- or a careless script cannot write a negative price or a 500% discount past these.
--
-- Written as raw SQL because Prisma's schema language cannot express CHECK constraints.
-- They are invisible to `prisma migrate diff`, so they survive future migrations rather
-- than being dropped as drift.

ALTER TABLE "QuotationLine"
  ADD CONSTRAINT "QuotationLine_quantity_positive"   CHECK (quantity > 0),
  ADD CONSTRAINT "QuotationLine_discount_range"      CHECK ("discountPct" >= 0 AND "discountPct" <= 100),
  ADD CONSTRAINT "QuotationLine_unitPrice_nonneg"    CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "QuotationLine_unitCost_nonneg"     CHECK ("unitCost" >= 0),
  ADD CONSTRAINT "QuotationLine_taxPct_range"        CHECK ("taxPct" >= 0 AND "taxPct" <= 100);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_listPrice_nonneg"          CHECK ("listPrice" >= 0),
  ADD CONSTRAINT "Product_cost_nonneg"               CHECK (cost >= 0),
  ADD CONSTRAINT "Product_taxPct_range"              CHECK ("taxPct" >= 0 AND "taxPct" <= 100);

ALTER TABLE "ProductCategory"
  ADD CONSTRAINT "ProductCategory_maxDiscount_range" CHECK ("maxDiscountPct" >= 0 AND "maxDiscountPct" <= 100);

ALTER TABLE "TierDiscountCeiling"
  ADD CONSTRAINT "TierCeiling_maxDiscount_range"     CHECK ("maxDiscountPct" >= 0 AND "maxDiscountPct" <= 100);

-- A payment of zero or less is not a payment. Refunds are credit notes, which are a
-- separate record with their own sign and their own audit event.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive"           CHECK (amount > 0);

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_amount_nonneg"             CHECK (amount >= 0);

ALTER TABLE "CreditNote"
  ADD CONSTRAINT "CreditNote_amount_positive"        CHECK (amount > 0);

-- A window longer than a short month is not a month-end offer.
ALTER TABLE "MonthEndPromotion"
  ADD CONSTRAINT "MonthEnd_window_range"             CHECK ("windowDays" >= 1 AND "windowDays" <= 28),
  ADD CONSTRAINT "MonthEnd_bonus_range"              CHECK ("bonusDiscountPct" >= 0 AND "bonusDiscountPct" <= 100),
  ADD CONSTRAINT "MonthEnd_giftShare_range"          CHECK ("maxGiftShareOfOrderPct" >= 0 AND "maxGiftShareOfOrderPct" <= 100);

ALTER TABLE "RiskConfig"
  ADD CONSTRAINT "RiskConfig_promotionBoost_min"     CHECK ("promotionBoost" >= 1);

ALTER TABLE "StockLevel"
  ADD CONSTRAINT "StockLevel_quantity_nonneg"        CHECK (quantity >= 0),
  ADD CONSTRAINT "StockLevel_reorder_nonneg"         CHECK ("reorderPoint" >= 0);
