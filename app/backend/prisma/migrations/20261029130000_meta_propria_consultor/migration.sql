-- Metas: cada consultor define a própria; a da loja e a dos outros continua
-- com a gestão (commercial.goals.manage). Só dados, sem mudar tabela.
INSERT INTO "Permission" ("id", "code", "label", "module", "createdAt") VALUES
  ('perm_commercial_goals_self', 'commercial.goals.self', 'Definir a própria meta de vendas', 'Comercial', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- quem vende: os perfis CONSULTOR e COMERCIAL, o ADMIN e qualquer perfil que já
-- defina metas ou mexa em orçamentos (a vendedora responsável)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'commercial.goals.self'
WHERE r."name" IN ('ADMIN', 'COMERCIAL', 'CONSULTOR')
   OR EXISTS (
     SELECT 1 FROM "RolePermission" rp
     JOIN "Permission" q ON q."id" = rp."permissionId"
     WHERE rp."roleId" = r."id" AND q."code" IN ('commercial.goals.manage', 'commercial.quotes.manage')
   )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
