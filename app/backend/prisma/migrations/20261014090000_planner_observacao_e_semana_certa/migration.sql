-- Planner pessoal: observação e data/hora do compromisso em cada item.
ALTER TABLE "PlannerItem" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "PlannerItem" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
