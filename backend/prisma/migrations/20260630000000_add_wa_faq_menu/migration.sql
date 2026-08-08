-- AlterTable
ALTER TABLE "WaSettings" ADD COLUMN     "faqMenuEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "faqTriggerKeywords" TEXT[] DEFAULT ARRAY['menu', 'faq', 'help']::TEXT[];

-- CreateTable
CREATE TABLE "WaFaq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaFaq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaFaq_isActive_order_idx" ON "WaFaq"("isActive", "order");
