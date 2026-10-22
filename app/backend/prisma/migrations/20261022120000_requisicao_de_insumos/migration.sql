-- Requisição de insumos para o almoxarifado (além da requisição de peças).
ALTER TABLE "Requisition" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PECAS';
CREATE INDEX IF NOT EXISTS "Requisition_kind_idx" ON "Requisition"("kind");
