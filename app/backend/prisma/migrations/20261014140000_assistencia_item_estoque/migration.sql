-- Item da assistência ligado a um produto do almoxarifado, para dar baixa no estoque.
ALTER TABLE "AssistanceItem" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "AssistanceItem" ADD COLUMN IF NOT EXISTS "stockMovedAt" TIMESTAMP(3);
DO $$ BEGIN
  ALTER TABLE "AssistanceItem" ADD CONSTRAINT "AssistanceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
