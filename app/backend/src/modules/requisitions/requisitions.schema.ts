import { InspectionResult, RequisitionItemStatus, RequisitionPriority, RequisitionStatus, Unit } from "@prisma/client";
import { z } from "zod";

const nullableText = (max = 500) => z.string().trim().max(max).optional().nullable();
/** tipo do insumo, na coluna TIPO da folha */
export const SUPPLY_TYPES = ["INSUMO", "FERRAGEM", "OUTRO"] as const;

export const requisitionItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().trim().min(2, "Descrição obrigatória").max(200),
  room: nullableText(120),
  supplyType: z.enum(SUPPLY_TYPES).optional().nullable(),
  material: nullableText(150),
  productId: z.string().optional().nullable(),
  thickness: z.number().positive().max(10000).optional().nullable(),
  length: z.number().positive().max(100000).optional().nullable(),
  width: z.number().positive().max(100000).optional().nullable(),
  quantity: z.number().int().positive("Quantidade deve ser maior que zero"),
  unit: z.nativeEnum(Unit).default(Unit.UNIT),
  edgeFinish: nullableText(200),
  note: nullableText(1000),
});

export const REQUISITION_KINDS = ["PECAS", "INSUMOS"] as const;

export const createRequisitionSchema = z.object({
  kind: z.enum(REQUISITION_KINDS).default("PECAS"),
  sector: nullableText(100), destination: nullableText(200), clientName: nullableText(150), projectReference: nullableText(150),
  priority: z.nativeEnum(RequisitionPriority).default(RequisitionPriority.NORMAL),
  orderedAt: z.string().datetime().optional().nullable(), neededAt: z.string().datetime().optional().nullable(), responsibleId: z.string().optional().nullable(), note: nullableText(3000),
  submit: z.boolean().default(false),
  attachments: z.array(z.object({ name: z.string().trim().min(1).max(255), url: z.string().url(), mimeType: nullableText(100), size: z.number().int().nonnegative().optional().nullable() })).max(20).default([]),
  items: z.array(requisitionItemSchema).min(1, "Adicione ao menos uma peça").max(200),
});

export const updateRequisitionSchema = createRequisitionSchema.omit({ submit: true, kind: true }).partial();
export const updateStatusSchema = z.object({ status: z.nativeEnum(RequisitionStatus), note: nullableText(1000), responsibleId: z.string().optional().nullable() });
export const updateItemStatusSchema = z.object({ status: z.nativeEnum(RequisitionItemStatus), note: nullableText(500) });
export const inspectionSchema = z.object({ result: z.nativeEnum(InspectionResult), note: nullableText(2000) });
export const reservationSchema = z.object({ items: z.array(z.object({ requisitionItemId: z.string().min(1), quantity: z.number().int().positive() })).min(1) });

export const requisitionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(20),
  kind: z.enum(REQUISITION_KINDS).optional(),
  status: z.nativeEnum(RequisitionStatus).optional(), priority: z.nativeEnum(RequisitionPriority).optional(), search: z.string().trim().optional(),
  my: z.enum(["true", "false"]).optional(), overdue: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "oldest", "deadline", "priority"]).default("newest"),
});

export type CreateRequisitionInput = z.infer<typeof createRequisitionSchema>;
export type UpdateRequisitionInput = z.infer<typeof updateRequisitionSchema>;
export type ReservationInput = z.infer<typeof reservationSchema>;
