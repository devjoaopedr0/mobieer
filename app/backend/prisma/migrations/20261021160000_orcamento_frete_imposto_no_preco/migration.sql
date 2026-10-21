-- Valor de referência do orçamento: frete e imposto em % entram no preço como a comissão.
ALTER TABLE "CommercialQuote" ADD COLUMN IF NOT EXISTS "freightPercent" DECIMAL(6,2) NOT NULL DEFAULT 0;
ALTER TABLE "CommercialQuote" ADD COLUMN IF NOT EXISTS "taxPercent" DECIMAL(6,2) NOT NULL DEFAULT 0;
ALTER TABLE "CommercialQuote" ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
