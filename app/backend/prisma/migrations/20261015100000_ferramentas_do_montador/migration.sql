-- Ferramentas sob a guarda do montador: o que está com ele (com foto) e a retirada (com foto).
CREATE TABLE IF NOT EXISTS "ContractorTool" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "contractorId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COM_ELE',
  "photoKey" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fromToolId" TEXT,
  "releasedAt" TIMESTAMP(3),
  "releasedPhotoKey" TEXT,
  "releasedTo" TEXT,
  "releasedToContractorId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractorTool_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractorTool_contractorId_status_idx" ON "ContractorTool"("contractorId", "status");
CREATE INDEX IF NOT EXISTS "ContractorTool_organizationId_idx" ON "ContractorTool"("organizationId");
DO $$ BEGIN
  ALTER TABLE "ContractorTool" ADD CONSTRAINT "ContractorTool_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
