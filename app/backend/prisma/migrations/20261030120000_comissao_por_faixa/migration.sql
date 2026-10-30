-- Comissão do consultor por faixa do total vendido no mês: vigências com
-- faixas, apuração consolidada por consultor/mês (com a regra copiada) e, no
-- financeiro, quem recebe a comissão e a apuração que gerou a linha.
-- Tudo aditivo: nada existente é alterado ou apagado.
-- CreateEnum
CREATE TYPE "CommissionMode" AS ENUM ('PROGRESSIVE', 'FLAT_ON_TOTAL');

-- CreateEnum
CREATE TYPE "CommissionSettlementStatus" AS ENUM ('CONSOLIDADA', 'REABERTA');

-- CreateEnum
CREATE TYPE "CommissionSettlementItemKind" AS ENUM ('SALE', 'MANUAL_ADJUSTMENT');

-- AlterEnum


ALTER TYPE "CommercialInteractionType" ADD VALUE 'FOLLOW_UP';
ALTER TYPE "CommercialInteractionType" ADD VALUE 'PROPOSAL';
ALTER TYPE "CommercialInteractionType" ADD VALUE 'NEGOTIATION';

-- AlterTable
ALTER TABLE "FinanceTransaction" ADD COLUMN     "commissionSettlementId" TEXT,
ADD COLUMN     "payeeUserId" TEXT;

-- CreateTable
CREATE TABLE "CommissionPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "CommissionMode" NOT NULL DEFAULT 'PROGRESSIVE',
    "role" TEXT NOT NULL DEFAULT 'VENDEDOR',
    "validFrom" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "minAmount" DECIMAL(14,2) NOT NULL,
    "maxAmount" DECIMAL(14,2),
    "percent" DECIMAL(6,3) NOT NULL,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "policyId" TEXT,
    "policySnapshot" JSONB NOT NULL,
    "mode" "CommissionMode" NOT NULL,
    "baseTotal" DECIMAL(14,2) NOT NULL,
    "commissionTotal" DECIMAL(14,2) NOT NULL,
    "effectivePercent" DECIMAL(7,4) NOT NULL,
    "creditIn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditOut" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "CommissionSettlementStatus" NOT NULL DEFAULT 'CONSOLIDADA',
    "consolidatedById" TEXT,
    "consolidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopenedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSettlementItem" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "kind" "CommissionSettlementItemKind" NOT NULL,
    "quoteId" TEXT,
    "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionSettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionPolicy_organizationId_validFrom_idx" ON "CommissionPolicy"("organizationId", "validFrom");

-- CreateIndex
CREATE INDEX "CommissionTier_policyId_position_idx" ON "CommissionTier"("policyId", "position");

-- CreateIndex
CREATE INDEX "CommissionSettlement_organizationId_month_idx" ON "CommissionSettlement"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionSettlement_organizationId_userId_month_key" ON "CommissionSettlement"("organizationId", "userId", "month");

-- CreateIndex
CREATE INDEX "CommissionSettlementItem_settlementId_idx" ON "CommissionSettlementItem"("settlementId");

-- CreateIndex
CREATE INDEX "CommissionSettlementItem_quoteId_idx" ON "CommissionSettlementItem"("quoteId");

-- AddForeignKey
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "CommissionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "CommissionPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTier" ADD CONSTRAINT "CommissionTier_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "CommissionPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "CommissionPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_consolidatedById_fkey" FOREIGN KEY ("consolidatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlementItem" ADD CONSTRAINT "CommissionSettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CommissionSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlementItem" ADD CONSTRAINT "CommissionSettlementItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CommercialQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_payeeUserId_fkey" FOREIGN KEY ("payeeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_commissionSettlementId_fkey" FOREIGN KEY ("commissionSettlementId") REFERENCES "CommissionSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Quem recebe, nas comissões já lançadas pelo aceite: a linha do orçamento
-- com o mesmo nome escrito na descrição ("... — comissão Fulano (3%)").
UPDATE "FinanceTransaction" ft
SET "payeeUserId" = c."userId"
FROM "CommercialQuoteCommission" c
WHERE ft."originQuoteId" = c."quoteId"
  AND ft."category" = 'Comissão de venda'
  AND ft."payeeUserId" IS NULL
  AND c."userId" IS NOT NULL
  AND c."referrerId" IS NULL
  AND position(('comissão ' || c."name" || ' (') in ft."description") > 0;
