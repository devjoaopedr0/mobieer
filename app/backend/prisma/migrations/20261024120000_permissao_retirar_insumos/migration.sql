-- Retirar insumo do almoxarifado (Saída de Materiais e "Entregar insumos" da
-- requisição) passa a ter permissão própria, ligada por perfil. Quem já
-- registrava saída continua podendo retirar.
INSERT INTO "Permission" ("id", "code", "label", "module", "createdAt") VALUES
  ('perm_stock_exit_supplies', 'stock.exit.supplies', 'Retirar insumos do estoque', 'Estoque', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT rp."roleId", p."id"
FROM "RolePermission" rp
JOIN "Permission" old ON old."id" = rp."permissionId" AND old."code" = 'stock.exit'
JOIN "Permission" p ON p."code" = 'stock.exit.supplies'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
