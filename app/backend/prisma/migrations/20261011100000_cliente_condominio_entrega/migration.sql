-- Cliente: nome do condomínio e endereço de entrega (quando é diferente do endereço do cadastro).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "condominium" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT;
