-- Número do contrato, continuando a sequência dos contratos que a loja já fazia.
ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "number" TEXT;
CREATE INDEX IF NOT EXISTS "ProjectDocument_organizationId_type_number_idx" ON "ProjectDocument"("organizationId", "type", "number");
