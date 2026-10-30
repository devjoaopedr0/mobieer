/**
 * Central de clientes — regras puras: carteira e filtro de origem.
 */
import type { Prisma } from "@prisma/client";
import type { Origin } from "./crm.rules";

/**
 * Carteira do CRM: com commercial.read.all, todos os clientes da organização;
 * sem, só os clientes em que a pessoa é o vendedor ou o atendente.
 */
export function crmClientScope(u: { id: string; organizationId: string; permissions: string[] }): Prisma.ClientWhereInput {
  const base: Prisma.ClientWhereInput = { organizationId: u.organizationId };
  if (u.permissions.includes("commercial.read.all")) return base;
  return { ...base, OR: [{ sellerId: u.id }, { attendantId: u.id }] };
}

/** Origem da lista fixa; "SEM_ORIGEM" = texto antigo que não bateu com a lista (ou nada). */
export function originFilter(origin: Origin | "SEM_ORIGEM" | undefined): Prisma.ClientWhereInput {
  if (!origin) return {};
  return origin === "SEM_ORIGEM" ? { origin: null } : { origin };
}
