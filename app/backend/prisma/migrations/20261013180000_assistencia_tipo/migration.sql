-- Tipo da assistência (assistência, ajuste pós-montagem, manutenção, erro interno, retrabalho).
ALTER TABLE "AssistanceTicket" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'ASSISTENCIA';
