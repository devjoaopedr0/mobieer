-- Data do pedido (DATA PEDIDO da folha) e tipo do insumo (coluna TIPO: insumo, ferragem ou outro).
ALTER TABLE "Requisition" ADD COLUMN IF NOT EXISTS "orderedAt" TIMESTAMP(3);
ALTER TABLE "RequisitionItem" ADD COLUMN IF NOT EXISTS "supplyType" TEXT;
