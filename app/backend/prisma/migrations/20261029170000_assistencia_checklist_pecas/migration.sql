-- Assistência: checklist de serviços (feito com quem e quando) e peças ligadas
-- a um ou mais serviços.
-- AlterTable
ALTER TABLE "AssistanceTicket" ADD COLUMN     "checklistSeededAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AssistanceTask" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistanceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AssistanceItemTasks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AssistanceItemTasks_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AssistanceTask_ticketId_position_idx" ON "AssistanceTask"("ticketId", "position");

-- CreateIndex
CREATE INDEX "_AssistanceItemTasks_B_index" ON "_AssistanceItemTasks"("B");

-- AddForeignKey
ALTER TABLE "AssistanceTask" ADD CONSTRAINT "AssistanceTask_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "AssistanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceTask" ADD CONSTRAINT "AssistanceTask_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssistanceItemTasks" ADD CONSTRAINT "_AssistanceItemTasks_A_fkey" FOREIGN KEY ("A") REFERENCES "AssistanceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssistanceItemTasks" ADD CONSTRAINT "_AssistanceItemTasks_B_fkey" FOREIGN KEY ("B") REFERENCES "AssistanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

