-- Itens especiais (metalon, vidro, espelho, laca, iluminação) ficam fora da base da comissão.
-- Aditiva: item antigo nasce como não especial; orçamento antigo fica sem base gravada (a base é o total).
ALTER TABLE "CommercialQuoteItem" ADD COLUMN "special" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommercialQuote" ADD COLUMN "commissionBase" DECIMAL(14,2);
