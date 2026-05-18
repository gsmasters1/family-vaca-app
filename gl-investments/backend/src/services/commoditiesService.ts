import { getQuotes } from "./marketData";
import type { Quote } from "./marketData";

export interface CommodityCategory {
  category: string;
  label: string;
  whyItMatters: string;
  symbols: string[];
  quotes: Quote[];
}

const COMMODITY_GROUPS: Omit<CommodityCategory, "quotes">[] = [
  {
    category: "gold",
    label: "Gold",
    whyItMatters: "Inflation hedge, dollar weakness signal",
    symbols: ["GC=F", "GLD"],
  },
  {
    category: "silver",
    label: "Silver",
    whyItMatters: "Industrial + monetary demand, leveraged gold play",
    symbols: ["SI=F", "SLV"],
  },
  {
    category: "lithium",
    label: "Lithium",
    whyItMatters: "EV battery critical mineral, long-term structural demand",
    symbols: ["LIT", "ALB", "LTHM", "SQM"],
  },
  {
    category: "bonds",
    label: "Bonds & Rates",
    whyItMatters: "Interest rate direction, risk-off signal",
    symbols: ["^TNX", "^IRX", "TLT", "BND", "IEF"],
  },
  {
    category: "metals",
    label: "Battery Metals",
    whyItMatters: "Copper and industrial metals drive EV and grid infrastructure",
    symbols: ["HG=F", "COPX"],
  },
];

export async function getCommodityCategory(
  category: string
): Promise<CommodityCategory | null> {
  const group = COMMODITY_GROUPS.find((g) => g.category === category);
  if (!group) return null;

  const quotes = await getQuotes(group.symbols);
  return { ...group, quotes };
}

export async function getAllCommodities(): Promise<CommodityCategory[]> {
  const results = await Promise.all(
    COMMODITY_GROUPS.map(async (group) => {
      const quotes = await getQuotes(group.symbols);
      return { ...group, quotes };
    })
  );
  return results;
}

export function listCategories(): string[] {
  return COMMODITY_GROUPS.map((g) => g.category);
}
