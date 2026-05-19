import { getDb } from "./database";

export type GICSSector =
  | "Energy"
  | "Materials"
  | "Industrials"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Health Care"
  | "Financials"
  | "Information Technology"
  | "Communication Services"
  | "Utilities"
  | "Real Estate";

export const ALL_SECTORS: GICSSector[] = [
  "Energy",
  "Materials",
  "Industrials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Health Care",
  "Financials",
  "Information Technology",
  "Communication Services",
  "Utilities",
  "Real Estate",
];

export interface SectorBenchmarks {
  typicalPELow: number;
  typicalPEHigh: number;
  valuationMetric: "PE" | "EV_EBITDA" | "P_FFO" | "P_BOOK" | "EV_REVENUE";
  keyMacroSignal: string;
  isCyclical: boolean;
  isDefensive: boolean;
}

const SECTOR_ETF_MAP: Record<GICSSector, string> = {
  "Energy": "XLE",
  "Materials": "XLB",
  "Industrials": "XLI",
  "Consumer Discretionary": "XLY",
  "Consumer Staples": "XLP",
  "Health Care": "XLV",
  "Financials": "XLF",
  "Information Technology": "XLK",
  "Communication Services": "XLC",
  "Utilities": "XLU",
  "Real Estate": "XLRE",
};

const SECTOR_BENCHMARKS: Record<GICSSector, SectorBenchmarks> = {
  "Energy": {
    typicalPELow: 10,
    typicalPEHigh: 20,
    valuationMetric: "EV_EBITDA",
    keyMacroSignal: "oil_price",
    isCyclical: true,
    isDefensive: false,
  },
  "Materials": {
    typicalPELow: 15,
    typicalPEHigh: 25,
    valuationMetric: "EV_EBITDA",
    keyMacroSignal: "commodity_prices",
    isCyclical: true,
    isDefensive: false,
  },
  "Industrials": {
    typicalPELow: 18,
    typicalPEHigh: 28,
    valuationMetric: "PE",
    keyMacroSignal: "manufacturing_pmi",
    isCyclical: true,
    isDefensive: false,
  },
  "Consumer Discretionary": {
    typicalPELow: 20,
    typicalPEHigh: 35,
    valuationMetric: "PE",
    keyMacroSignal: "consumer_confidence",
    isCyclical: true,
    isDefensive: false,
  },
  "Consumer Staples": {
    typicalPELow: 18,
    typicalPEHigh: 28,
    valuationMetric: "PE",
    keyMacroSignal: "inflation_cpi",
    isCyclical: false,
    isDefensive: true,
  },
  "Health Care": {
    typicalPELow: 18,
    typicalPEHigh: 30,
    valuationMetric: "PE",
    keyMacroSignal: "drug_approval_pipeline",
    isCyclical: false,
    isDefensive: true,
  },
  "Financials": {
    typicalPELow: 10,
    typicalPEHigh: 18,
    valuationMetric: "P_BOOK",
    keyMacroSignal: "yield_curve",
    isCyclical: true,
    isDefensive: false,
  },
  "Information Technology": {
    typicalPELow: 25,
    typicalPEHigh: 45,
    valuationMetric: "EV_REVENUE",
    keyMacroSignal: "fed_funds_rate",
    isCyclical: false,
    isDefensive: false,
  },
  "Communication Services": {
    typicalPELow: 18,
    typicalPEHigh: 30,
    valuationMetric: "PE",
    keyMacroSignal: "advertising_spend",
    isCyclical: false,
    isDefensive: false,
  },
  "Utilities": {
    typicalPELow: 15,
    typicalPEHigh: 22,
    valuationMetric: "P_FFO",
    keyMacroSignal: "interest_rates",
    isCyclical: false,
    isDefensive: true,
  },
  "Real Estate": {
    typicalPELow: 30,
    typicalPEHigh: 50,
    valuationMetric: "P_FFO",
    keyMacroSignal: "interest_rates",
    isCyclical: false,
    isDefensive: false,
  },
};

// 200+ well-known S&P 500 components mapped to GICS sector
const TICKER_SECTOR_MAP: Record<string, GICSSector> = {
  // Energy
  "XOM": "Energy",
  "CVX": "Energy",
  "COP": "Energy",
  "EOG": "Energy",
  "SLB": "Energy",
  "MPC": "Energy",
  "PSX": "Energy",
  "VLO": "Energy",
  "PXD": "Energy",
  "OXY": "Energy",
  "HES": "Energy",
  "DVN": "Energy",
  "FANG": "Energy",
  "HAL": "Energy",
  "BKR": "Energy",
  "APA": "Energy",
  "MRO": "Energy",
  "OKE": "Energy",
  "WMB": "Energy",
  "KMI": "Energy",

  // Materials
  "LIN": "Materials",
  "APD": "Materials",
  "ECL": "Materials",
  "SHW": "Materials",
  "FCX": "Materials",
  "NEM": "Materials",
  "NUE": "Materials",
  "VMC": "Materials",
  "MLM": "Materials",
  "DOW": "Materials",
  "DD": "Materials",
  "PPG": "Materials",
  "ALB": "Materials",
  "CF": "Materials",
  "MOS": "Materials",
  "IFF": "Materials",
  "IP": "Materials",
  "PKG": "Materials",
  "WRK": "Materials",
  "BALL": "Materials",

  // Industrials
  "GE": "Industrials",
  "HON": "Industrials",
  "UPS": "Industrials",
  "CAT": "Industrials",
  "DE": "Industrials",
  "BA": "Industrials",
  "LMT": "Industrials",
  "RTX": "Industrials",
  "NOC": "Industrials",
  "GD": "Industrials",
  "MMM": "Industrials",
  "EMR": "Industrials",
  "ITW": "Industrials",
  "ETN": "Industrials",
  "PH": "Industrials",
  "ROK": "Industrials",
  "FDX": "Industrials",
  "CSX": "Industrials",
  "NSC": "Industrials",
  "UNP": "Industrials",
  "DAL": "Industrials",
  "UAL": "Industrials",
  "AAL": "Industrials",
  "LUV": "Industrials",
  "WM": "Industrials",
  "RSG": "Industrials",

  // Consumer Discretionary
  "AMZN": "Consumer Discretionary",
  "TSLA": "Consumer Discretionary",
  "HD": "Consumer Discretionary",
  "MCD": "Consumer Discretionary",
  "NKE": "Consumer Discretionary",
  "LOW": "Consumer Discretionary",
  "SBUX": "Consumer Discretionary",
  "TJX": "Consumer Discretionary",
  "BKNG": "Consumer Discretionary",
  "MAR": "Consumer Discretionary",
  "HLT": "Consumer Discretionary",
  "YUM": "Consumer Discretionary",
  "CMG": "Consumer Discretionary",
  "ORLY": "Consumer Discretionary",
  "AZO": "Consumer Discretionary",
  "ROST": "Consumer Discretionary",
  "BBY": "Consumer Discretionary",
  "EBAY": "Consumer Discretionary",
  "ETSY": "Consumer Discretionary",
  "RCL": "Consumer Discretionary",
  "CCL": "Consumer Discretionary",
  "MGM": "Consumer Discretionary",
  "F": "Consumer Discretionary",
  "GM": "Consumer Discretionary",
  "APTV": "Consumer Discretionary",

  // Consumer Staples
  "WMT": "Consumer Staples",
  "PG": "Consumer Staples",
  "KO": "Consumer Staples",
  "PEP": "Consumer Staples",
  "COST": "Consumer Staples",
  "PM": "Consumer Staples",
  "MO": "Consumer Staples",
  "MDLZ": "Consumer Staples",
  "CL": "Consumer Staples",
  "KMB": "Consumer Staples",
  "GIS": "Consumer Staples",
  "K": "Consumer Staples",
  "HRL": "Consumer Staples",
  "SJM": "Consumer Staples",
  "CAG": "Consumer Staples",
  "CPB": "Consumer Staples",
  "CHD": "Consumer Staples",
  "CLX": "Consumer Staples",
  "KR": "Consumer Staples",
  "SYY": "Consumer Staples",

  // Health Care
  "JNJ": "Health Care",
  "UNH": "Health Care",
  "LLY": "Health Care",
  "PFE": "Health Care",
  "ABBV": "Health Care",
  "MRK": "Health Care",
  "TMO": "Health Care",
  "ABT": "Health Care",
  "DHR": "Health Care",
  "BMY": "Health Care",
  "AMGN": "Health Care",
  "GILD": "Health Care",
  "ISRG": "Health Care",
  "MDT": "Health Care",
  "SYK": "Health Care",
  "BDX": "Health Care",
  "ZBH": "Health Care",
  "BIIB": "Health Care",
  "REGN": "Health Care",
  "VRTX": "Health Care",
  "MRNA": "Health Care",
  "CVS": "Health Care",
  "CI": "Health Care",
  "HUM": "Health Care",
  "ELV": "Health Care",

  // Financials
  "BRK.B": "Financials",
  "JPM": "Financials",
  "BAC": "Financials",
  "WFC": "Financials",
  "GS": "Financials",
  "MS": "Financials",
  "BLK": "Financials",
  "C": "Financials",
  "AXP": "Financials",
  "USB": "Financials",
  "PNC": "Financials",
  "TFC": "Financials",
  "COF": "Financials",
  "DFS": "Financials",
  "SYF": "Financials",
  "V": "Financials",
  "MA": "Financials",
  "PYPL": "Financials",
  "ICE": "Financials",
  "CME": "Financials",
  "SPGI": "Financials",
  "MCO": "Financials",
  "MMC": "Financials",
  "AON": "Financials",
  "MET": "Financials",
  "PRU": "Financials",
  "AFL": "Financials",
  "ALL": "Financials",

  // Information Technology
  "AAPL": "Information Technology",
  "MSFT": "Information Technology",
  "NVDA": "Information Technology",
  "AVGO": "Information Technology",
  "ORCL": "Information Technology",
  "ADBE": "Information Technology",
  "CRM": "Information Technology",
  "CSCO": "Information Technology",
  "AMD": "Information Technology",
  "INTC": "Information Technology",
  "QCOM": "Information Technology",
  "TXN": "Information Technology",
  "IBM": "Information Technology",
  "NOW": "Information Technology",
  "INTU": "Information Technology",
  "AMAT": "Information Technology",
  "LRCX": "Information Technology",
  "KLAC": "Information Technology",
  "MU": "Information Technology",
  "HPQ": "Information Technology",
  "DELL": "Information Technology",
  "HPE": "Information Technology",
  "FTNT": "Information Technology",
  "PANW": "Information Technology",
  "CRWD": "Information Technology",
  "SNOW": "Information Technology",
  "PLTR": "Information Technology",
  "APP": "Information Technology",

  // Communication Services
  "META": "Communication Services",
  "GOOGL": "Communication Services",
  "GOOG": "Communication Services",
  "NFLX": "Communication Services",
  "DIS": "Communication Services",
  "CMCSA": "Communication Services",
  "VZ": "Communication Services",
  "T": "Communication Services",
  "TMUS": "Communication Services",
  "TTWO": "Communication Services",
  "EA": "Communication Services",
  "ATVI": "Communication Services",
  "WBD": "Communication Services",
  "PARA": "Communication Services",
  "FOXA": "Communication Services",
  "SNAP": "Communication Services",
  "PINS": "Communication Services",
  "RDDT": "Communication Services",
  "SPOT": "Communication Services",

  // Utilities
  "NEE": "Utilities",
  "DUK": "Utilities",
  "SO": "Utilities",
  "D": "Utilities",
  "AEP": "Utilities",
  "EXC": "Utilities",
  "XEL": "Utilities",
  "SRE": "Utilities",
  "PCG": "Utilities",
  "ED": "Utilities",
  "EIX": "Utilities",
  "ETR": "Utilities",
  "PEG": "Utilities",
  "AWK": "Utilities",
  "WEC": "Utilities",
  "DTE": "Utilities",
  "PPL": "Utilities",
  "CMS": "Utilities",
  "AES": "Utilities",
  "NI": "Utilities",

  // Real Estate
  "PLD": "Real Estate",
  "AMT": "Real Estate",
  "EQIX": "Real Estate",
  "CCI": "Real Estate",
  "PSA": "Real Estate",
  "O": "Real Estate",
  "WELL": "Real Estate",
  "DLR": "Real Estate",
  "AVB": "Real Estate",
  "EQR": "Real Estate",
  "SPG": "Real Estate",
  "VTR": "Real Estate",
  "ARE": "Real Estate",
  "BXP": "Real Estate",
  "KIM": "Real Estate",
  "VICI": "Real Estate",
  "SBA": "Real Estate",
  "IRM": "Real Estate",
  "WY": "Real Estate",
  "MAA": "Real Estate",
};

export function classifyTicker(ticker: string): GICSSector | "UNKNOWN" {
  const upper = ticker.toUpperCase();

  // Check database override first
  try {
    const db = getDb();
    const override = db
      .prepare("SELECT sector FROM sector_overrides WHERE ticker = ?")
      .get(upper) as { sector: string } | undefined;
    if (override) return override.sector as GICSSector;
  } catch {
    // Table may not exist yet — fall through to static map
  }

  return TICKER_SECTOR_MAP[upper] ?? "UNKNOWN";
}

export function getSectorETF(sector: GICSSector): string {
  return SECTOR_ETF_MAP[sector];
}

export function getSectorBenchmarks(sector: GICSSector): SectorBenchmarks {
  return SECTOR_BENCHMARKS[sector];
}

export function getUnknownBenchmarks(): SectorBenchmarks {
  return {
    typicalPELow: 15,
    typicalPEHigh: 30,
    valuationMetric: "PE",
    keyMacroSignal: "general_market",
    isCyclical: false,
    isDefensive: false,
  };
}

export function getTickersForSector(
  universe: string[],
  sector: GICSSector
): string[] {
  return universe.filter((t) => classifyTicker(t) === sector);
}
