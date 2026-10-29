-- Planejamento da semana: a tarefa pode ser ligada a uma obra cadastrada,
-- e as datas da obra limitam o dia em que ela fica. O texto livre continua.
ALTER TABLE "ProductionPlanTask" ADD COLUMN "projectId" TEXT;

CREATE INDEX "ProductionPlanTask_projectId_idx" ON "ProductionPlanTask"("projectId");

ALTER TABLE "ProductionPlanTask" ADD CONSTRAINT "ProductionPlanTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
