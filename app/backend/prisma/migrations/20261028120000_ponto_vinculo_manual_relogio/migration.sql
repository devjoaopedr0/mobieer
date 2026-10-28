-- Ponto: guarda se o número do relógio foi ligado ao colaborador à mão (vale mais
-- que o vínculo automático). Cadastros existentes ficam NULL = automático.
CREATE TYPE "ClockLinkSource" AS ENUM ('AUTO', 'MANUAL');
ALTER TABLE "Employee" ADD COLUMN "clockLinkSource" "ClockLinkSource";
