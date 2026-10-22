-- Editar os modelos (cláusulas do contrato) e a numeração é do administrativo;
-- o comercial continua gerando o contrato a partir do modelo.
INSERT INTO "Permission" ("id", "code", "label", "module", "createdAt") VALUES
  ('perm_templates_manage', 'templates.manage', 'Editar modelos de documentos (cláusulas do contrato) e numeração', 'Documentos', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'templates.manage'
WHERE r."name" IN ('ADMIN', 'MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
