-- Requisição: obra (projeto cadastrado), observação do item, dados da etiqueta da
-- peça, item faltando, recebimento pelo montador e fotos (etiqueta, falta, recebimento).
-- O tipo do item (supplyType) é texto: FERRAMENTA, PERFIL, PUXADOR e ACESSORIOS
-- entram só na validação, sem mudar o que já está gravado.

ALTER TYPE "RequisitionItemStatus" ADD VALUE 'MISSING';
ALTER TYPE "RequisitionItemStatus" ADD VALUE 'CANCELLED';

CREATE TYPE "RequisitionPhotoKind" AS ENUM ('ETIQUETA', 'FALTANDO', 'RECEBIMENTO');

ALTER TABLE "Requisition" ADD COLUMN "projectId" TEXT;
CREATE INDEX "Requisition_projectId_idx" ON "Requisition"("projectId");
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RequisitionItem"
  ADD COLUMN "observation" TEXT,
  ADD COLUMN "pieceCode" TEXT,
  ADD COLUMN "moduleRef" TEXT,
  ADD COLUMN "cutPlanRef" TEXT,
  ADD COLUMN "missingQuantity" INTEGER,
  ADD COLUMN "receivedQuantity" INTEGER,
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "receivedById" TEXT;
ALTER TABLE "RequisitionItem" ADD CONSTRAINT "RequisitionItem_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RequisitionPhoto" (
    "id" TEXT NOT NULL,
    "kind" "RequisitionPhotoKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "ocrJson" JSONB,
    "ocrConfirmedAt" TIMESTAMP(3),
    "ocrConfirmedById" TEXT,
    "requisitionItemId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequisitionPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RequisitionPhoto_requisitionItemId_idx" ON "RequisitionPhoto"("requisitionItemId");
CREATE INDEX "RequisitionPhoto_uploadedById_idx" ON "RequisitionPhoto"("uploadedById");
ALTER TABLE "RequisitionPhoto" ADD CONSTRAINT "RequisitionPhoto_requisitionItemId_fkey" FOREIGN KEY ("requisitionItemId") REFERENCES "RequisitionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequisitionPhoto" ADD CONSTRAINT "RequisitionPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
