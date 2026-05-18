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
  {
    category: "energy",
    label: "Energy (Oil & Gas)",
    whyItMatters: "Rising oil = inflation pressure on Fed; falling = demand destruction or easing. APEX macro driver.",
    symbols: ["CL=F", "BZ=F", "NG=F", "XLE", "XOP"],
  },
  {
    category: "clean-energy",
    label: "Clean Energy",
    whyItMatters: "IRA policy tailwinds, grid buildout, and energy transition — structural multi-year demand",
    symbols: ["FSLR", "ENPH", "NEE", "URA", "ICLN"],
  },
  {
    category: "global-indices",
    label: "Global Indices",
    whyItMatters: "International divergence signals capital rotation — money moves when one market is cheap relative to another",
    symbols: ["^FTSE", "^GDAXI", "^N225", "^HSI", "^GSPC"],
  },
  {
    category: "global-etfs",
    label: "International ETFs",
    whyItMatters: "Trade global exposure without foreign currency accounts — hedge against US-only risk",
    symbols: ["EWJ", "EEM", "FXI", "EWZ", "EWG"],
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

// WTI crude % change — fed into APEX macro scorer as inflation pressure signal
export async function getEnergyTrend(): Promise<number> {
  try {
    const quotes = await getQuotes(["CL=F"]);
    return quotes[0]?.changePct ?? 0;
  } catch {
    return 0;
  }
}
