-- CRM: lista fixa de origem (leads, clientes e negócios) e motivo da perda do lead.
-- A origem fica numa coluna nova; o texto original continua em "source"/"leadSource".
-- CreateEnum
CREATE TYPE "LeadOrigin" AS ENUM ('INSTAGRAM', 'INDICACAO', 'GOOGLE', 'SITE', 'ARQUITETO', 'PARCEIROS', 'OUTRO');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "origin" "LeadOrigin";

-- AlterTable
ALTER TABLE "CommercialLead" ADD COLUMN     "lostReasonCode" "LostReason",
ADD COLUMN     "origin" "LeadOrigin";

-- AlterTable
ALTER TABLE "CommercialOpportunity" ADD COLUMN     "origin" "LeadOrigin";


-- Valores livres que já existem viram item da lista quando dá para saber qual
-- (mesmas palavras de normalizeOrigin em crm.rules.ts). O resto fica sem origem
-- na lista, com o texto como estava.
UPDATE "CommercialLead" SET "origin" = CASE
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'insta|^ig$' THEN 'INSTAGRAM'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'indica' THEN 'INDICACAO'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'google' THEN 'GOOGLE'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ '^site([^a-z0-9_]|$)|website|landing|pagina' THEN 'SITE'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'arquitet' THEN 'ARQUITETO'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'parceir' THEN 'PARCEIROS'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ '^outro' THEN 'OUTRO'::"LeadOrigin"
  END
WHERE "origin" IS NULL AND "source" IS NOT NULL AND btrim("source") <> '';

UPDATE "Client" SET "origin" = CASE
    WHEN btrim(lower(translate("leadSource", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'insta|^ig$' THEN 'INSTAGRAM'::"LeadOrigin"
    WHEN btrim(lower(translate("leadSource", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'indica' THEN 'INDICACAO'::"LeadOrigin"
    WHEN btrim(lower(translate("leadSource", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'google' THEN 'GOOGLE'::"LeadOrigin"
    WHEN btrim(lower(translate("leadSource", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ '^site([^a-z0-9_]|$)|website|landing|pagina' THEN 'SITE'::"LeadOrigin"
    WHEN btrim(lower(translate("leadSource", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'arquitet' THEN 'ARQUITETO'::"LeadOrigin"
    WHEN btrim(lower(translate("leadSource", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'parceir' THEN 'PARCEIROS'::"LeadOrigin"
    WHEN btrim(lower(translate("leadSource", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ '^outro' THEN 'OUTRO'::"LeadOrigin"
  END
WHERE "origin" IS NULL AND "leadSource" IS NOT NULL AND btrim("leadSource") <> '';

UPDATE "CommercialOpportunity" SET "origin" = CASE
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'insta|^ig$' THEN 'INSTAGRAM'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'indica' THEN 'INDICACAO'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'google' THEN 'GOOGLE'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ '^site([^a-z0-9_]|$)|website|landing|pagina' THEN 'SITE'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'arquitet' THEN 'ARQUITETO'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ 'parceir' THEN 'PARCEIROS'::"LeadOrigin"
    WHEN btrim(lower(translate("source", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))) ~ '^outro' THEN 'OUTRO'::"LeadOrigin"
  END
WHERE "origin" IS NULL AND "source" IS NOT NULL AND btrim("source") <> '';
