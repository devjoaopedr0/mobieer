-- Assistência: itens (peça, ferragem, mão de obra…), em garantia por padrão; o que for
-- cobrado vira conta a receber. Registro interno (erro, retrabalho) não aparece no portal.
ALTER TABLE "AssistanceTicket" ADD COLUMN IF NOT EXISTS "internal" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "AssistanceItem" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "charged" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistanceItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssistanceItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "AssistanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AssistanceItem_ticketId_idx" ON "AssistanceItem"("ticketId");
ALTER TABLE "FinanceTransaction" ADD COLUMN IF NOT EXISTS "originAssistanceId" TEXT;
CREATE INDEX IF NOT EXISTS "FinanceTransaction_originAssistanceId_idx" ON "FinanceTransaction"("originAssistanceId");
