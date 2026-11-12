-- Ambiente do orçamento que não sai no PDF nem conta no total (fica guardado, sem precisar apagar).
-- Aditiva: todo item existente continua dentro do orçamento.
ALTER TABLE "CommercialQuoteItem" ADD COLUMN "included" BOOLEAN NOT NULL DEFAULT true;
