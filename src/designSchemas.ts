import * as z from "zod/v4";

export const layerSchema = z
  .number()
  .int()
  .positive()
  .describe("JLCEDA/EasyEDA Pro numeric EPCB_LayerId. Common: TOP=1, BOTTOM=2, TOP_SILKSCREEN=3, BOARD_OUTLINE=11.");

export const pcbLineSchema = z.object({
  kind: z.literal("pcbLine"),
  net: z.string().default(""),
  layer: layerSchema.default(1),
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  width: z.number().positive().default(0.25),
});

export const pcbPadSchema = z.object({
  kind: z.literal("pcbPad"),
  padNumber: z.string(),
  x: z.number(),
  y: z.number(),
  layer: layerSchema.default(12).describe("Use MULTI=12 for through-hole pads, TOP=1 or BOTTOM=2 for SMD pads."),
  net: z.string().optional(),
  shape: z.enum(["ELLIPSE", "RECT", "OVAL"]).default("ELLIPSE"),
  width: z.number().positive().default(1.6),
  height: z.number().positive().default(1.6),
  holeDiameter: z.number().positive().optional().describe("If present, creates a round plated hole."),
});

export const pcbViaSchema = z.object({
  kind: z.literal("pcbVia"),
  net: z.string().default(""),
  x: z.number(),
  y: z.number(),
  holeDiameter: z.number().positive().default(0.3),
  diameter: z.number().positive().default(0.6),
});

export const schWireSchema = z.object({
  kind: z.literal("schWire"),
  points: z
    .array(z.number())
    .min(4)
    .describe("Polyline coordinates as [x1, y1, x2, y2, ...]."),
  net: z.string().optional(),
});

export const schNetFlagSchema = z.object({
  kind: z.literal("schNetFlag"),
  identification: z.string().default("Power"),
  net: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
});

export const schComponentSchema = z.object({
  kind: z.literal("schComponent"),
  libraryUuid: z.string(),
  uuid: z.string(),
  x: z.number(),
  y: z.number(),
  subPartName: z.string().optional(),
  rotation: z.number().default(0),
  addIntoBom: z.boolean().default(true),
  addIntoPcb: z.boolean().default(true),
});

export const pcbComponentSchema = z.object({
  kind: z.literal("pcbComponent"),
  libraryUuid: z.string(),
  uuid: z.string(),
  layer: layerSchema.default(1),
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
});

export const edaCommandSchema = z.discriminatedUnion("kind", [
  pcbLineSchema,
  pcbPadSchema,
  pcbViaSchema,
  schWireSchema,
  schNetFlagSchema,
  schComponentSchema,
  pcbComponentSchema,
]);

export const pcbDesignSchema = z.object({
  boardName: z.string().optional().describe("If set, creates a PCB with this name in the current project before placing primitives."),
  units: z.literal("mm").default("mm"),
  commands: z.array(edaCommandSchema).min(1).max(500),
});

export const headerBreakoutSchema = z.object({
  boardName: z.string().default("AI Header Breakout"),
  width: z.number().positive().default(30),
  height: z.number().positive().default(20),
  rows: z.number().int().min(1).max(4).default(2),
  pinsPerRow: z.number().int().min(1).max(40).default(8),
  pitch: z.number().positive().default(2.54),
  padDiameter: z.number().positive().default(1.6),
  drillDiameter: z.number().positive().default(0.8),
  traceWidth: z.number().positive().default(0.3),
  includeOutline: z.boolean().default(true),
  fanoutLength: z.number().min(0).default(3),
});

export type HeaderBreakout = z.infer<typeof headerBreakoutSchema>;
export type PcbDesign = z.infer<typeof pcbDesignSchema>;
