/**
 * Truth Filter — separates primary data from hype, marketing, and noise.
 *
 * Scoring model:
 *   Source authority  (0–40 pts): who published it
 *   Content quality   (0–30 pts): language patterns, specificity
 *   Corroboration     (0–20 pts): confirmed by other tier-1/2 sources
 *   Freshness         (0–10 pts): how recent
 *
 * Total 0–100. Thresholds:
 *   80–100  VERIFIED    — official filing, wire service, primary data
 *   60–79   RELIABLE    — established financial media, cross-checked
 *   40–59   MIXED       — community, analyst opinion, single source
 *   20–39   NOISE       — social, speculative, single unverified source
 *   0–19    TRASH       — marketing copy, guaranteed-return claims
 */

export type TrustTier = "VERIFIED" | "RELIABLE" | "MIXED" | "NOISE" | "TRASH";

export interface FilterResult {
  score: number;
  tier: TrustTier;
  flags: string[];
  authorityScore: number;
  contentScore: number;
}

// ─── Source authority table ───────────────────────────────────────────────
const SOURCE_AUTHORITY: Record<string, number> = {
  // Tier 1 — primary/regulatory (35–40)
  "sec.gov": 40,
  "federalreserve.gov": 40,
  "treasury.gov": 40,
  "bls.gov": 40,
  "census.gov": 38,
  "fdic.gov": 38,
  "cftc.gov": 38,
  "finra.org": 36,
  "occ.gov": 36,
  // Tier 2 — major wire services (27–34)
  "reuters.com": 34,
  "apnews.com": 34,
  "wsj.com": 32,
  "ft.com": 32,
  "bloomberg.com": 32,
  "economist.com": 30,
  "barrons.com": 30,
  "nytimes.com": 28,
  // Tier 3 — established financial media (16–26)
  "cnbc.com": 24,
  "marketwatch.com": 22,
  "thestreet.com": 20,
  "investopedia.com": 20,
  "morningstar.com": 24,
  "marketbeat.com": 22,   // analyst consensus, earnings, institutional data
  "zacks.com": 20,
  "seekingalpha.com": 16,
  "fool.com": 16,
  "minoritymindset.com": 18, // financial literacy, wealth-building fundamentals
  // Tier 4 — community/social (5–15)
  "reddit.com": 12,
  "stocktwits.com": 10,
  "twitter.com": 8,
  "x.com": 8,
  "youtube.com": 6,
  // Tier 5 — unknown/default (3)
  "__default__": 3,
};

// ─── Language patterns ────────────────────────────────────────────────────
const SALES_TRASH_PATTERNS = [
  /guaranteed\s+(returns?|profit|gain)/i,
  /can('t| not)\s+lose/i,
  /risk[\s-]free\s+profit/i,
  /\d{3,}%\s+(returns?|gains?|profit)/i,
  /limited\s+time\s+offer/i,
  /act\s+now/i,
  /secret\s+(stock|tip|method|formula)/i,
  /Wall Street (doesn't|does not) want/i,
  /this\s+one\s+(trick|weird|simple)/i,
  /subscribe\s+(now|today)\s+to/i,
  /click\s+here\s+to/i,
  /\$\d+\s+per\s+month/i,
  /exclusive\s+membership/i,
  /\bpump\b.{0,30}\bprofit\b/i,
];

const HYPE_PATTERNS = [
  /\bto\s+the\s+moon\b/i,
  /\b(moon|mooning|moonshot)\b/i,
  /\b(diamond\s+hands?|ape\s+(together|strong))\b/i,
  /\b(tendies|yolo|send\s+it)\b/i,
  /\b10[x×]\s*(gains?|returns?|profit)/i,
  /\b(generational\s+wealth|life[\s-]changing)\b/i,
  /\bnever\s+been\s+a\s+better\s+time\b/i,
];

const QUALITY_SIGNALS = [
  /\bfiling\s+date\b/i,
  /\b(10-K|10-Q|8-K|S-1|13F|Form\s+4)\b/,
  /\bfiscal\s+(year|quarter)\b/i,
  /\b(earnings\s+per\s+share|EPS|revenue|EBITDA|P\/E)\b/i,
  /\b(basis\s+points?|bps|fed\s+funds\s+rate)\b/i,
  /\b(year[\s-]over[\s-]year|YoY|quarter[\s-]over[\s-]quarter|QoQ)\b/i,
  /\b(consensus\s+estimate|analyst\s+estimate)\b/i,
  /according\s+to\s+(the\s+)?(SEC|Fed|Treasury|BLS|Federal\s+Reserve)/i,
];

// ─── Main scoring function ────────────────────────────────────────────────
export function scoreContent(
  text: string,
  sourceUrl: string,
  publishedAt?: Date
): FilterResult {
  const flags: string[] = [];

  // Authority score
  const domain = extractDomain(sourceUrl);
  const authorityScore = SOURCE_AUTHORITY[domain] ?? SOURCE_AUTHORITY["__default__"];

  // Content score (0–30)
  let contentScore = 15; // neutral baseline

  let trashHits = 0;
  for (const p of SALES_TRASH_PATTERNS) {
    if (p.test(text)) { trashHits++; flags.push(`SALES:${p.source.slice(0, 20)}`); }
  }
  let hypeHits = 0;
  for (const p of HYPE_PATTERNS) {
    if (p.test(text)) { hypeHits++; flags.push(`HYPE:${p.source.slice(0, 20)}`); }
  }
  let qualityHits = 0;
  for (const p of QUALITY_SIGNALS) {
    if (p.test(text)) qualityHits++;
  }

  contentScore += qualityHits * 3;      // up to +15 for quality signals
  contentScore -= trashHits * 8;        // -8 per sales pattern
  contentScore -= hypeHits * 4;         // -4 per hype pattern
  contentScore = Math.max(0, Math.min(30, contentScore));

  if (trashHits >= 2) flags.push("MARKETING_COPY");
  if (hypeHits >= 2) flags.push("HYPE_LANGUAGE");
  if (qualityHits >= 3) flags.push("DATA_RICH");

  // Freshness score (0–10)
  let freshnessScore = 5;
  if (publishedAt) {
    const ageHours = (Date.now() - publishedAt.getTime()) / 3_600_000;
    if (ageHours < 1) freshnessScore = 10;
    else if (ageHours < 4) freshnessScore = 9;
    else if (ageHours < 12) freshnessScore = 7;
    else if (ageHours < 24) freshnessScore = 5;
    else if (ageHours < 72) freshnessScore = 3;
    else freshnessScore = 1;
  }

  const total = authorityScore + contentScore + freshnessScore;
  const score = Math.max(0, Math.min(100, total));

  return {
    score,
    tier: scoreTier(score),
    flags,
    authorityScore,
    contentScore,
  };
}

function scoreTier(score: number): TrustTier {
  if (score >= 80) return "VERIFIED";
  if (score >= 60) return "RELIABLE";
  if (score >= 40) return "MIXED";
  if (score >= 20) return "NOISE";
  return "TRASH";
}

function extractDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // Match longest known key
    const known = Object.keys(SOURCE_AUTHORITY).sort((a, b) => b.length - a.length);
    return known.find((k) => host.endsWith(k)) ?? "__default__";
  } catch {
    return "__default__";
  }
}
