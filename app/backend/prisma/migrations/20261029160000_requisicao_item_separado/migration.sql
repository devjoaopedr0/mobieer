-- Requisição: separação por item (quantas peças já foram separadas, quem e quando).
-- AlterTable
ALTER TABLE "RequisitionItem" ADD COLUMN     "separatedAt" TIMESTAMP(3),
ADD COLUMN     "separatedById" TEXT,
ADD COLUMN     "separatedQuantity" INTEGER;

-- AddForeignKey
ALTER TABLE "RequisitionItem" ADD CONSTRAINT "RequisitionItem_separatedById_fkey" FOREIGN KEY ("separatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

