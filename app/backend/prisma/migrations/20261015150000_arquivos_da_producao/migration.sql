-- Arquivos do pedido de produção enviados direto: planos de corte, etiquetas e outros.
CREATE TABLE IF NOT EXISTS "ProductionFile" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'PLANO_CORTE',
  "fileName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT,
  "size" INTEGER,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductionFile_orderId_idx" ON "ProductionFile"("orderId");
DO $$ BEGIN
  ALTER TABLE "ProductionFile" ADD CONSTRAINT "ProductionFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
