-- DropIndex
DROP INDEX "ApprovalRule_sequence_idx";

-- AlterTable
ALTER TABLE "RiskConfig" ADD COLUMN     "promotionBoost" DECIMAL(5,2) NOT NULL DEFAULT 1.25;

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRule_sequence_key" ON "ApprovalRule"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

