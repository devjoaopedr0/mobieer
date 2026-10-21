-- Peça que precisa ser refeita por erro (corte, medida, projeto, avaria…), ligada ao projeto e a uma tarefa do planejamento da semana.
CREATE TABLE IF NOT EXISTS "ProductionRework" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "piece" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "person" TEXT,
  "dueDate" TIMESTAMP(3),
  "planTaskId" TEXT,
  "doneAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionRework_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductionRework_organizationId_createdAt_idx" ON "ProductionRework"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductionRework_projectId_idx" ON "ProductionRework"("projectId");
DO $$ BEGIN
  ALTER TABLE "ProductionRework" ADD CONSTRAINT "ProductionRework_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
