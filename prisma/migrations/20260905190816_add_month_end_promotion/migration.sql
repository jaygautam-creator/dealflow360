-- CreateTable
CREATE TABLE "MonthEndPromotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 7,
    "bonusDiscountPct" DECIMAL(5,2) NOT NULL,
    "maxGiftShareOfOrderPct" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthEndPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthEndPromotion_isActive_updatedAt_idx" ON "MonthEndPromotion"("isActive", "updatedAt");
