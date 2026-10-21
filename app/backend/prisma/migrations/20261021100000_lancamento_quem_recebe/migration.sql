-- Quem recebe (ou quem paga) o lançamento, em texto livre: pessoa da equipe, prestador, fornecedor.
ALTER TABLE "FinanceTransaction" ADD COLUMN IF NOT EXISTS "payee" TEXT;
CREATE INDEX IF NOT EXISTS "FinanceTransaction_organizationId_payee_idx" ON "FinanceTransaction"("organizationId", "payee");
