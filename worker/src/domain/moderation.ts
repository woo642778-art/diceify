export interface ModerationInput {
  body: string;
  recentNormalizedBodies: readonly string[];
  messagesIn5Seconds: number;
  messagesIn30Seconds: number;
  mentions: number;
  links: number;
  priorLevel: number;
}

export interface ModerationResult {
  score: number;
  decision: "allow" | "warn" | "review" | "mute";
  triggers: string[];
  aiReview: boolean;
}

export function normalizeMessage(body: string) {
  return body.normalize("NFKC").toLocaleLowerCase().replace(/[!?.ㅋㅎ\u110f\u1112\s]+/g, "").slice(0, 500);
}

export function moderateDeterministically(input: ModerationInput): ModerationResult {
  const triggers: string[] = [];
  let score = 0;
  const normalized = normalizeMessage(input.body);
  const repeats = input.recentNormalizedBodies.filter((body) => normalizeMessage(body) === normalized).length;
  const longRun = /(.)\1{9,}/u.test(input.body);
  const personalInfo = /(?:01[016789][ -]?\d{3,4}[ -]?\d{4})|(?:[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu.test(input.body);
  const targetedHarassment = /(?:너|니가|넌|당신).{0,8}(?:꺼져|죽어|병신|미친놈|새끼)/u.test(input.body);
  if (input.messagesIn5Seconds >= 5) { score += 0.38; triggers.push("burst_5s"); }
  if (input.messagesIn30Seconds >= 12) { score += 0.28; triggers.push("burst_30s"); }
  if (repeats >= 2) { score += 0.35; triggers.push("near_duplicate"); }
  if (longRun) { score += 0.18; triggers.push("character_spam"); }
  if (input.links >= 3) { score += 0.32; triggers.push("link_spam"); }
  if (input.mentions >= 8) { score += 0.25; triggers.push("mention_spam"); }
  if (personalInfo) { score += 0.42; triggers.push("personal_information"); }
  if (targetedHarassment) { score += 0.58; triggers.push("targeted_harassment"); }
  score = Math.min(1, score + Math.min(0.18, input.priorLevel * 0.03));
  const decision = score >= 0.82 ? "mute" : score >= 0.56 ? "review" : score >= 0.32 ? "warn" : "allow";
  return { score, decision, triggers, aiReview: score >= 0.42 && score < 0.9 };
}
