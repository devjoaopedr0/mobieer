-- Senha provisória enviada por e-mail: o cliente troca no primeiro acesso
ALTER TABLE "ClientAccount" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
