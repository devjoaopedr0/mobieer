-- Número do colaborador no relógio de ponto (EnNo). É diferente da matrícula do sistema
-- (EMP-0001): casar pelas duas gravou o ponto de uma pessoa no cadastro de outra.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "clockRegistration" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_organizationId_clockRegistration_key" ON "Employee"("organizationId", "clockRegistration");
