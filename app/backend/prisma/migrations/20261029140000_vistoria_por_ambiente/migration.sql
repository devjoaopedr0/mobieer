-- Vistoria por ambiente: uma linha por ambiente (situação, observação e fotos),
-- pendências por ambiente (peça faltante, mudança de ambiente, outra) e o
-- registro de cada passagem de pendência para outro ambiente.
-- CreateEnum
CREATE TYPE "InspectionRoomStatus" AS ENUM ('NAO_VISTORIADO', 'APROVADO', 'COM_PENDENCIA', 'REPROVADO');

-- CreateEnum
CREATE TYPE "InspectionPendencyKind" AS ENUM ('PECA_FALTANTE', 'MUDANCA_AMBIENTE', 'OUTRA');

-- CreateEnum
CREATE TYPE "InspectionPendencyStatus" AS ENUM ('ABERTA', 'RESOLVIDA');

-- CreateTable
CREATE TABLE "SiteInspectionRoom" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "projectRoomId" TEXT,
    "name" TEXT NOT NULL,
    "status" "InspectionRoomStatus" NOT NULL DEFAULT 'NAO_VISTORIADO',
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteInspectionRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionPendency" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "kind" "InspectionPendencyKind" NOT NULL,
    "description" TEXT NOT NULL,
    "targetRoomName" TEXT,
    "status" "InspectionPendencyStatus" NOT NULL DEFAULT 'ABERTA',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionPendency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionPendencyTransfer" (
    "id" TEXT NOT NULL,
    "pendencyId" TEXT NOT NULL,
    "fromRoomId" TEXT NOT NULL,
    "toRoomId" TEXT NOT NULL,
    "reason" TEXT,
    "byId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionPendencyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteInspectionRoom_inspectionId_position_idx" ON "SiteInspectionRoom"("inspectionId", "position");

-- CreateIndex
CREATE INDEX "InspectionPendency_inspectionId_status_idx" ON "InspectionPendency"("inspectionId", "status");

-- CreateIndex
CREATE INDEX "InspectionPendency_roomId_idx" ON "InspectionPendency"("roomId");

-- CreateIndex
CREATE INDEX "InspectionPendencyTransfer_pendencyId_idx" ON "InspectionPendencyTransfer"("pendencyId");

-- AddForeignKey
ALTER TABLE "SiteInspectionRoom" ADD CONSTRAINT "SiteInspectionRoom_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SiteInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInspectionRoom" ADD CONSTRAINT "SiteInspectionRoom_projectRoomId_fkey" FOREIGN KEY ("projectRoomId") REFERENCES "ProjectRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInspectionRoom" ADD CONSTRAINT "SiteInspectionRoom_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPendency" ADD CONSTRAINT "InspectionPendency_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SiteInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPendency" ADD CONSTRAINT "InspectionPendency_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SiteInspectionRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPendency" ADD CONSTRAINT "InspectionPendency_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPendency" ADD CONSTRAINT "InspectionPendency_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPendencyTransfer" ADD CONSTRAINT "InspectionPendencyTransfer_pendencyId_fkey" FOREIGN KEY ("pendencyId") REFERENCES "InspectionPendency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPendencyTransfer" ADD CONSTRAINT "InspectionPendencyTransfer_fromRoomId_fkey" FOREIGN KEY ("fromRoomId") REFERENCES "SiteInspectionRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPendencyTransfer" ADD CONSTRAINT "InspectionPendencyTransfer_toRoomId_fkey" FOREIGN KEY ("toRoomId") REFERENCES "SiteInspectionRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPendencyTransfer" ADD CONSTRAINT "InspectionPendencyTransfer_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

