-- Liberar orçamento (pontuação abaixo do mínimo) e registrar/desfazer o aceite
-- do cliente passam a ser só do perfil "Liberação de orçamento", dado à Jéssica.
INSERT INTO "Permission" ("id", "code", "label", "module", "createdAt") VALUES
  ('perm_commercial_quotes_accept', 'commercial.quotes.accept', 'Registrar e desfazer o aceite do orçamento pelo cliente', 'Comercial', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Role" ("id", "name", "label", "description", "createdAt") VALUES
  ('role_liberacao_orcamento', 'LIBERACAO_ORCAMENTO', 'Liberação de orçamento', 'Único perfil que libera orçamento abaixo do mínimo e registra o aceite do cliente', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- ninguém mais libera por outro perfil
DELETE FROM "RolePermission"
WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" IN ('commercial.quotes.approve', 'commercial.quotes.accept'))
  AND "roleId" <> (SELECT "id" FROM "Role" WHERE "name" = 'LIBERACAO_ORCAMENTO');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('commercial.quotes.approve', 'commercial.quotes.accept')
WHERE r."name" = 'LIBERACAO_ORCAMENTO'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- perfil adicional para a Jéssica (o perfil principal dela não muda)
INSERT INTO "UserExtraRole" ("userId", "roleId", "createdAt")
SELECT u."id", r."id", CURRENT_TIMESTAMP
FROM "User" u
JOIN "Role" r ON r."name" = 'LIBERACAO_ORCAMENTO'
WHERE (u."name" ILIKE 'jessica%' OR u."name" ILIKE 'jéssica%' OR u."email" ILIKE 'jessica%')
  AND u."roleId" <> r."id"
ON CONFLICT ("userId", "roleId") DO NOTHING;
