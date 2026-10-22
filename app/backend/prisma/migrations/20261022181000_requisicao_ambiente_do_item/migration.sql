-- Ambiente de cada peça/insumo da requisição (coluna AMBIENTE da planilha da loja).
ALTER TABLE "RequisitionItem" ADD COLUMN IF NOT EXISTS "room" TEXT;
