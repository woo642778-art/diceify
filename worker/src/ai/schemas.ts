import { z } from "zod";

const resourceSchema = z.object({
  gold: z.number().int().min(0).max(1_000_000_000),
  stone: z.number().int().min(0).max(10_000_000),
  solarCore: z.number().int().min(0).max(10_000_000).optional(),
}).strict();

const routeSchema = z.object({
  nodeIds: z.array(z.string().min(1).max(80)).max(8),
  cost: resourceSchema,
  remaining: resourceSchema,
  gainPercent: z.number().finite().nullable(),
  confidence: z.enum(["verified", "partial"]),
}).strict();

const contextSchema = z.object({
  revisionId: z.string().min(1).max(96).optional(),
  dataVersion: z.string().min(1).max(96),
  metaSnapshot: z.string().max(80).nullable().optional(),
  goal: z.enum(["basic-dps", "resource-efficiency", "target-dice", "pvp", "coop"]),
  targetDiceId: z.string().min(1).max(80),
  resources: resourceSchema,
  route: routeSchema.nullable(),
  alternatives: z.array(routeSchema).max(3),
  breakpoint: z.object({
    decision: z.enum(["spend", "save", "no-verified-gain"]),
    shortage: resourceSchema,
  }).strict(),
  selectedNodeId: z.string().min(1).max(80).optional(),
  decisionSupport: z.object({
    stability: z.enum(["high", "medium", "low"]),
    evidenceConfidence: z.enum(["high", "medium", "low"]),
    reasons: z.array(z.string().min(1).max(300)).max(12),
    routeChangeBreakpoint: z.object({
      resource: z.enum(["gold", "stone", "solarCore"]),
      amount: z.number().int().min(1).max(1_000_000_000),
      routeNodeIds: z.array(z.string().min(1).max(80)).max(8),
    }).strict().nullable(),
    contributions: z.array(z.object({
      nodeId: z.string().min(1).max(80),
      fromRank: z.number().int().min(0).max(100),
      toRank: z.number().int().min(1).max(100),
      role: z.enum(["direct", "bridge"]),
      metric: z.enum(["target-step", "practical-dps", "basic-attack-dps", "unverified"]),
      value: z.number().finite().nullable(),
    }).strict()).max(8),
  }).strict().optional(),
}).strict();

const baseSchema = z.object({
  locale: z.enum(["ko", "en"]),
  question: z.string().trim().min(1).max(800),
}).strict();

export const aiAnalysisRequestSchema = z.discriminatedUnion("task", [
  baseSchema.extend({
    task: z.literal("parse_intent"),
    current: z.object({
      goal: z.enum(["basic-dps", "resource-efficiency", "target-dice", "pvp", "coop"]),
      targetDiceId: z.string().min(1).max(80),
      maxPurchases: z.number().int().min(1).max(8),
      resources: resourceSchema,
      knownDiceIds: z.array(z.string().min(1).max(80)).min(1).max(80),
      knownNodeIds: z.array(z.string().min(1).max(80)).max(16),
    }).strict(),
  }),
  baseSchema.extend({ task: z.literal("explain_route"), context: contextSchema }),
  baseSchema.extend({ task: z.literal("answer_followup"), context: contextSchema }),
]);

export type AiAnalysisRequest = z.infer<typeof aiAnalysisRequestSchema>;

export const hostedIntentSchema = z.object({
  intent: z.enum(["calculate_route", "compare_routes", "find_breakpoint", "explain_result"]),
  goal: z.enum(["basic-dps", "resource-efficiency", "target-dice", "pvp", "coop"]).nullable(),
  targetDiceId: z.string().min(1).max(80).nullable(),
  targetNodeId: z.string().min(1).max(80).nullable(),
  comparisonNodeId: z.string().min(1).max(80).nullable(),
  purchaseLimit: z.number().int().min(1).max(8).nullable(),
  resourceDelta: resourceSchema.partial(),
  resourceOverride: resourceSchema.partial(),
}).strict();

export type HostedIntent = z.infer<typeof hostedIntentSchema>;
