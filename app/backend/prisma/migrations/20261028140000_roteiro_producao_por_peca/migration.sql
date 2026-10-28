-- Roteiro de produção por peça: etapas base (editáveis só pelo administrador),
-- tipos de peça e ajustes por tipo (sem regras iniciais). A peça é o
-- ProductionItem: o tipo fica nele e o andamento de cada etapa numa tabela
-- ligada a ele. As 9 etapas e os tipos de peça entram pelo sistema na primeira
-- vez que a organização abre o roteiro (nada do que já está gravado muda).

-- CreateEnum
CREATE TYPE "RouteOverrideAction" AS ENUM ('SKIP', 'APPEND', 'REPLACE');

-- CreateEnum
CREATE TYPE "PieceStepStatus" AS ENUM ('PENDING', 'DONE', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "ProductionItem" ADD COLUMN     "pieceTypeConfirmedById" TEXT,
ADD COLUMN     "pieceTypeId" TEXT,
ADD COLUMN     "pieceTypeSource" TEXT;

-- CreateTable
CREATE TABLE "RouteStep" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT,
    "requirePhoto" BOOLEAN NOT NULL DEFAULT false,
    "productionStep" "ProductionStepKey",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PieceType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteOverride" (
    "id" TEXT NOT NULL,
    "pieceTypeId" TEXT NOT NULL,
    "routeStepId" TEXT NOT NULL,
    "action" "RouteOverrideAction" NOT NULL,
    "instruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PieceStepProgress" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "routeStepId" TEXT NOT NULL,
    "status" "PieceStepStatus" NOT NULL DEFAULT 'PENDING',
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "photoKey" TEXT,
    "photoName" TEXT,
    "photoMime" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PieceStepProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteStep_organizationId_position_key" ON "RouteStep"("organizationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PieceType_organizationId_name_key" ON "PieceType"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RouteOverride_pieceTypeId_routeStepId_key" ON "RouteOverride"("pieceTypeId", "routeStepId");

-- CreateIndex
CREATE INDEX "PieceStepProgress_routeStepId_status_idx" ON "PieceStepProgress"("routeStepId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PieceStepProgress_itemId_routeStepId_key" ON "PieceStepProgress"("itemId", "routeStepId");

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_pieceTypeId_fkey" FOREIGN KEY ("pieceTypeId") REFERENCES "PieceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_pieceTypeConfirmedById_fkey" FOREIGN KEY ("pieceTypeConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStep" ADD CONSTRAINT "RouteStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceType" ADD CONSTRAINT "PieceType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteOverride" ADD CONSTRAINT "RouteOverride_pieceTypeId_fkey" FOREIGN KEY ("pieceTypeId") REFERENCES "PieceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteOverride" ADD CONSTRAINT "RouteOverride_routeStepId_fkey" FOREIGN KEY ("routeStepId") REFERENCES "RouteStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceStepProgress" ADD CONSTRAINT "PieceStepProgress_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceStepProgress" ADD CONSTRAINT "PieceStepProgress_routeStepId_fkey" FOREIGN KEY ("routeStepId") REFERENCES "RouteStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceStepProgress" ADD CONSTRAINT "PieceStepProgress_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Permissão: editar o roteiro base e os tipos de peça (só administrador)
INSERT INTO "Permission" ("id", "code", "label", "module", "createdAt") VALUES
  ('perm_production_route_manage', 'production.route.manage', 'Editar o roteiro de produção por peça (etapas, instruções e tipos de peça)', 'Produção', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'production.route.manage'
WHERE r."name" = 'ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
