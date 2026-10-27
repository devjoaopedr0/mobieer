-- Conversa do cliente no portal (equipe + assistente virtual)
CREATE TYPE "PortalMessageAuthor" AS ENUM ('CLIENT', 'STAFF', 'AI');

CREATE TABLE "PortalMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorKind" "PortalMessageAuthor" NOT NULL,
    "clientAccountId" TEXT,
    "userId" TEXT,
    "toTeam" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "readByStaffAt" TIMESTAMP(3),
    "readByClientAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalMessage_clientId_createdAt_idx" ON "PortalMessage"("clientId", "createdAt");
CREATE INDEX "PortalMessage_organizationId_createdAt_idx" ON "PortalMessage"("organizationId", "createdAt");

ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
