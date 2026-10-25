/**
 * Orçamento e contrato têm numeração separada. Enquanto as duas eram uma só, os
 * orçamentos novos pegaram números da sequência dos contratos (ORC-00376,
 * ORC-00378) e o próximo orçamento sairia ORC-00379. Este script devolve esses
 * orçamentos para a sequência dos orçamentos (ORC-00006, ORC-00007…), com
 * versões, adendos e a descrição dos lançamentos do financeiro.
 *
 * Os PDFs de orçamento já enviados ao cliente continuam com o número antigo.
 *
 * 1) Simulação — só mostra o que mudaria:
 *      npx tsx scripts/renumerar-orcamentos.ts
 * 2) Para valer:
 *      npx tsx scripts/renumerar-orcamentos.ts --confirmar
 *
 * Tudo numa transação: se algo falhar, nada muda.
 */
import "dotenv/config";
import { prisma } from "../src/prisma";
import { compactQuoteNumbers } from "../src/modules/templates/contract-number";

/** Primeiro número da sequência dos contratos: orçamento daí para cima veio dela. */
const CONTRACT_START = 376;

async function main() {
  const confirm = process.argv.includes("--confirmar");
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    const changes = await compactQuoteNumbers(org.id, CONTRACT_START, !confirm);
    if (!changes.length) {
      console.log(`${org.name}: nenhum orçamento com número da sequência dos contratos.`);
      continue;
    }
    console.log(`${org.name}:`);
    for (const c of changes) console.log(`  ${c.from} → ${c.to}  (${c.client}, ${c.versions} versão(ões))`);
  }
  console.log(confirm ? "\nFeito." : "\nSimulação: nada foi alterado. Para valer, rode de novo com --confirmar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
