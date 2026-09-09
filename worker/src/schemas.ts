import { z } from "zod";
import diceRows from "../../src/game-data/dice.compact.json";
import { NON_PLAYABLE_DICE_IDS } from "../../src/game-data/playableDice";

const knownDice = new Set(diceRows.map((row) => String(row[0])).filter((id) => !NON_PLAYABLE_DICE_IDS.has(id)));
export const deckSchema = z.array(z.string().min(1).max(80).refine((id) => knownDice.has(id), "unknown_dice")).length(5).refine((ids) => new Set(ids).size === 5, "duplicate_dice");
const deck = deckSchema;
const jsonRecord = z.record(z.string(), z.unknown());

export const profileSchema = z.object({
  nickname: z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N}_ .-]+$/u),
  mode: z.enum(["pvp", "coop", "crit", "mixed"]),
  preferredRole: z.enum(["dealer", "support", "balanced"]),
  spendProfile: z.enum(["free", "light", "invested"]),
  dataConsent: z.boolean(),
  recommendationOptOut: z.boolean().default(false),
  turnstileToken: z.string().max(4096).optional(),
}).strict();

export const syncSchema = z.object({
  state: jsonRecord,
  expectedVersion: z.number().int().min(0),
  schemaVersion: z.number().int().min(1).max(100),
  requestId: z.string().min(8).max(100).optional(),
}).strict();

export const buildSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(""),
  visibility: z.enum(["private", "unlisted", "public"]),
  mode: z.enum(["pvp", "coop", "crit", "mixed"]),
  deck,
  tree: jsonRecord,
  totalGold: z.number().int().min(0).max(2_000_000_000),
  totalCore: z.number().int().min(0).max(10_000_000),
}).strict();

export const eventSubmissionSchema = z.object({
  deck,
  mode: z.enum(["pvp", "coop", "crit"]),
  purpose: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  dataConsent: z.literal(true),
}).strict();

export const roomSchema = z.object({
  title: z.string().trim().min(2).max(60),
  category: z.enum(["general", "coop", "crit", "deck", "tree", "question"]),
  description: z.string().trim().max(300).default(""),
  maxMembers: z.number().int().min(2).max(100),
  visibility: z.enum(["public", "unlisted"]),
  joinRequirement: z.string().trim().max(200).default(""),
  tags: z.array(z.string().trim().min(1).max(20)).max(8).default([]),
  slowModeSeconds: z.number().int().min(0).max(3600).default(0),
  turnstileToken: z.string().max(4096).optional(),
}).strict();

export const guildSchema = z.object({
  name: z.string().trim().min(2).max(30),
  guildCode: z.string().trim().min(2).max(40).regex(/^[\p{L}\p{N}_#.-]+$/u),
  recruiting: z.boolean(),
  activeHours: z.string().trim().max(80).default(""),
  description: z.string().trim().min(10).max(500),
  contact: z.string().trim().min(2).max(160),
}).strict();

export const guildSignalSchema = z.object({
  kind: z.enum(["save", "inquiry"]),
}).strict();

export const matchmakingSchema = z.object({
  kind: z.enum(["coop", "crit"]),
  target: z.string().trim().min(1).max(80),
  role: z.enum(["dealer", "support", "balanced"]),
  lookingFor: z.enum(["dealer", "support", "any"]),
  deck,
  beginnerOk: z.boolean(),
  capacity: z.number().int().min(2).max(8),
  expiresInMinutes: z.number().int().min(5).max(360),
}).strict();

export const reportSchema = z.object({
  subjectUserId: z.string().max(80).optional(),
  messageId: z.string().max(80).optional(),
  reason: z.enum(["harassment", "hate", "spam", "advertising", "scam", "inappropriate", "personal_information", "other"]),
  detail: z.string().trim().max(1000).default(""),
}).strict().refine((value) => value.subjectUserId || value.messageId, "report_subject_required");

export const reactionSchema = z.object({ reaction: z.enum(["like", "helpful", "thanks"]) }).strict();

export const appealSchema = z.object({
  sanctionId: z.string().min(1).max(80),
  statement: z.string().trim().min(10).max(1500),
}).strict();

export const recommendationFeedbackSchema = z.object({
  recommendationId: z.string().min(1).max(80),
  outcome: z.enum(["used", "ignored", "won", "lost", "improved", "regressed"]),
  rating: z.number().int().min(1).max(5).optional(),
}).strict();

export const adminReportActionSchema = z.object({
  state: z.enum(["reviewing", "resolved", "dismissed"]),
  resolution: z.string().trim().max(1000).default(""),
  sanctionLevel: z.number().int().min(1).max(7).optional(),
  sanctionHours: z.number().int().min(1).max(24 * 365).optional(),
}).strict();
