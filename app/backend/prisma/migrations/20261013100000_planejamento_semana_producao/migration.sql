-- Planejamento da semana da produção: tarefas por dia e por pessoa, com subtarefas marcáveis.
-- "person" é o nome como a loja escreve (não exige usuário com senha).
CREATE TABLE IF NOT EXISTS "ProductionPlanTask" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "person" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reference" TEXT,
  "items" JSONB NOT NULL DEFAULT '[]',
  "done" BOOLEAN NOT NULL DEFAULT false,
  "doneAt" TIMESTAMP(3),
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionPlanTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionPlanTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductionPlanTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProductionPlanTask_organizationId_date_idx" ON "ProductionPlanTask"("organizationId", "date");
