-- Meta adaptativa: proposta do sistema por vendedor e mês, com quem aprovou,
-- quando, e o ajuste feito depois (alimenta a próxima proposta).
-- CreateEnum
CREATE TYPE "SalesGoalProposalStatus" AS ENUM ('PENDENTE', 'APROVADA', 'AJUSTADA', 'RECUSADA');

-- CreateTable
CREATE TABLE "SalesGoalProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "proposedAmount" DECIMAL(14,2) NOT NULL,
    "basis" JSONB NOT NULL,
    "status" "SalesGoalProposalStatus" NOT NULL DEFAULT 'PENDENTE',
    "approvedAmount" DECIMAL(14,2),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "adjustedAmount" DECIMAL(14,2),
    "adjustedById" TEXT,
    "adjustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesGoalProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesGoalProposal_organizationId_month_idx" ON "SalesGoalProposal"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SalesGoalProposal_organizationId_userId_month_key" ON "SalesGoalProposal"("organizationId", "userId", "month");

-- AddForeignKey
ALTER TABLE "SalesGoalProposal" ADD CONSTRAINT "SalesGoalProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesGoalProposal" ADD CONSTRAINT "SalesGoalProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesGoalProposal" ADD CONSTRAINT "SalesGoalProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesGoalProposal" ADD CONSTRAINT "SalesGoalProposal_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

