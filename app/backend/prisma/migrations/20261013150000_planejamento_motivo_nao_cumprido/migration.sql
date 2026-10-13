-- Planejamento da semana: motivo da tarefa não cumprida e para que dia ela foi passada.
ALTER TABLE "ProductionPlanTask" ADD COLUMN IF NOT EXISTS "missedReason" TEXT;
ALTER TABLE "ProductionPlanTask" ADD COLUMN IF NOT EXISTS "missedNote" TEXT;
ALTER TABLE "ProductionPlanTask" ADD COLUMN IF NOT EXISTS "missedAt" TIMESTAMP(3);
ALTER TABLE "ProductionPlanTask" ADD COLUMN IF NOT EXISTS "movedToDate" TIMESTAMP(3);
ALTER TABLE "ProductionPlanTask" ADD COLUMN IF NOT EXISTS "movedFromId" TEXT;
