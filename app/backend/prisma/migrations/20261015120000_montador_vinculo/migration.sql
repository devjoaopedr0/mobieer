-- Vínculo do montador: AUTONOMO (diária ou serviço) ou CONTRATADO (salário mensal).
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "engagement" TEXT NOT NULL DEFAULT 'AUTONOMO';
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "monthlySalary" DECIMAL(12,2);
