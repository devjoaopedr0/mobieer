-- Frentes de produção que correm em paralelo à marcenaria no mesmo pedido
-- (metalon, peças especiais, portas de vidro). Por enquanto cada frente tem só a
-- situação; as etapas de cada uma entram quando a loja definir.
CREATE TABLE IF NOT EXISTS "ProductionFront" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "front" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "responsibleId" TEXT,
  "dueAt" TIMESTAMP(3),
  "notes" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionFront_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionFront_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductionFront_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionFront_orderId_front_key" ON "ProductionFront"("orderId", "front");
