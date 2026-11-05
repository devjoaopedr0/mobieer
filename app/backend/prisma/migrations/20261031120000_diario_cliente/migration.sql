-- Diário do cliente: anotação e alteração de projeto, ligadas (opcionalmente) a um projeto
ALTER TYPE "CommercialInteractionType" ADD VALUE IF NOT EXISTS 'NOTE';
ALTER TYPE "CommercialInteractionType" ADD VALUE IF NOT EXISTS 'PROJECT_CHANGE';

ALTER TABLE "CommercialInteraction" ADD COLUMN "projectId" TEXT;
CREATE INDEX "CommercialInteraction_projectId_occurredAt_idx" ON "CommercialInteraction"("projectId", "occurredAt");
ALTER TABLE "CommercialInteraction" ADD CONSTRAINT "CommercialInteraction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
