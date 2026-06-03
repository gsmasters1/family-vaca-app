import axios from "axios";
import { getDb } from "./database";

interface TrackedFund {
  name: string;
  cik: string;
}

const TRACKED_FUNDS: TrackedFund[] = [
  { name: "Berkshire Hathaway", cik: "0001067983" },
  { name: "Bridgewater Associates", cik: "0001350694" },
  { name: "Renaissance Technologies", cik: "0001037389" },
  { name: "D.E. Shaw", cik: "0001009207" },
  { name: "Two Sigma", cik: "0001450144" },
  { name: "Citadel", cik: "0001423298" },
  { name: "Appaloosa Management", cik: "0001070154" },
  { name: "Pershing Square", cik: "0001336528" },
];

export interface HedgeFundHolding {
  id: string;
  fundName: string;
  ticker: string;
  cusip: string;
  valueUsd: number;
  shares: number;
  pctOfPortfolio: number;
  reportedAt: string;
}

export interface HedgeFundSignal {
  ticker: string;
  trackedBy: string[];
  totalValue: number;
  signal: "SMART_MONEY" | "NONE";
}

const SEC_HEADERS = {
  "User-Agent": "GL-Investments research@glinvestments.local",
  "Accept-Encoding": "gzip, deflate",
};

interface SecSubmissionsResponse {
  filings: {
    recent: {
      form: string[];
      accessionNumber: string[];
      reportDate: string[];
    };
  };
}

interface SecFilingIndex {
  directory: {
    item: Array<{
      name: string;
      href: string;
    }>;
  };
}

async function getLatest13FAccession(
  cik: string
): Promise<{ accession: string; reportDate: string } | null> {
  const paddedCik = cik.replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

  const res = await axios.get<SecSubmissionsResponse>(url, {
    headers: SEC_HEADERS,
    timeout: 15_000,
  });

  const filings = res.data?.filings?.recent;
  if (!filings) return null;

  const idx = filings.form.findIndex((f) => f === "13F-HR");
  if (idx === -1) return null;

  return {
    accession: filings.accessionNumber[idx],
    reportDate: filings.reportDate[idx] ?? "",
  };
}

interface Holding13F {
  nameOfIssuer: string;
  cusip: string;
  value: number;
  shares: number;
}

async function parseHoldings(
  cik: string,
  accessionNumber: string
): Promise<Holding13F[]> {
  const numericCik = cik.replace(/^0+/, "");
  const accession = accessionNumber.replace(/-/g, "");
  const accessionFormatted = accessionNumber;

  // Fetch filing index to find the primary XML document
  const indexUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${numericCik}&type=13F-HR&dateb=&owner=include&count=1&search_text=`;

  // Directly construct the document URL using EDGAR archive convention
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accession}`;

  let xmlContent = "";
  try {
    // Try primary-document.xml first, then infotable.xml (both common 13F formats)
    for (const filename of [
      `${accessionFormatted}-index.json`,
      "primary_doc.xml",
      "infotable.xml",
      "form13fInfoTable.xml",
    ]) {
      try {
        const r = await axios.get<string>(`${baseUrl}/${filename}`, {
          headers: SEC_HEADERS,
          timeout: 15_000,
          responseType: "text",
        });
        if (
          typeof r.data === "string" &&
          (r.data.includes("<infoTable>") || r.data.includes("<nameOfIssuer>"))
        ) {
          xmlContent = r.data;
          break;
        }
        if (typeof r.data === "object") {
          // It's an index JSON — find the XML file
          const indexData = r.data as { directory?: { item?: Array<{ name: string }> } };
          const xmlFile = indexData.directory?.item?.find(
            (i) => i.name?.endsWith(".xml") && i.name !== "primary_doc.xml"
          );
          if (xmlFile) {
            const xmlRes = await axios.get<string>(
              `${baseUrl}/${xmlFile.name}`,
              { headers: SEC_HEADERS, timeout: 15_000, responseType: "text" }
            );
            xmlContent = String(xmlRes.data);
            break;
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }

  if (!xmlContent) return [];

  const holdings: Holding13F[] = [];
  const infoTableRegex = /<infoTable>([\s\S]*?)<\/infoTable>/g;
  let match: RegExpExecArray | null;

  while ((match = infoTableRegex.exec(xmlContent)) !== null) {
    const block = match[1];
    const extract = (tag: string): string => {
      const m = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, "i").exec(block);
      return m?.[1]?.trim() ?? "";
    };

    const value = parseInt(extract("value") || "0", 10) * 1000; // 13F values in thousands
    const shares =
      parseInt(extract("sshPrnamt") || "0", 10) ||
      parseInt(extract("sshprnamt") || "0", 10);

    holdings.push({
      nameOfIssuer: extract("nameOfIssuer"),
      cusip: extract("cusip"),
      value,
      shares,
    });
  }

  // Return top 20 by value
  return holdings.sort((a, b) => b.value - a.value).slice(0, 20);
}

// CUSIP to ticker mapping for common holdings — SEC 13Fs don't always include tickers
const CUSIP_TICKER: Record<string, string> = {
  "037833100": "AAPL",
  "594918104": "MSFT",
  "023135106": "AMZN",
  "02079K305": "GOOG",
  "02079K107": "GOOGL",
  "67066G104": "NVDA",
  "88160R101": "TSLA",
  "30303M102": "META",
  "91936Q102": "UNH",
  "110122108": "BRK.B",
  "46625H100": "JPM",
  "808513105": "SCHW",
  "172967424": "C",
  "931142103": "WMT",
  "025816109": "AXP",
  "49090A103": "KO",
  "712704105": "PFE",
  "609207105": "MDLZ",
};

function cusipToTicker(cusip: string, nameOfIssuer: string): string {
  // Check known CUSIP→ticker map first
  if (CUSIP_TICKER[cusip]) return CUSIP_TICKER[cusip];

  // Fallback: derive from issuer name (rough heuristic)
  const upper = nameOfIssuer.toUpperCase().replace(/[^A-Z ]/g, "").trim();
  const words = upper.split(" ");
  // Return empty string if we can't determine ticker — caller filters empties
  return "";
}

export async function fetchHedgeFundHoldings(
  cik: string
): Promise<HedgeFundHolding[]> {
  const fund = TRACKED_FUNDS.find((f) => f.cik === cik);
  const fundName = fund?.name ?? cik;

  const filing = await getLatest13FAccession(cik).catch(() => null);
  if (!filing) return [];

  const raw = await parseHoldings(cik, filing.accession).catch(() => []);
  if (raw.length === 0) return [];

  const totalValue = raw.reduce((sum, h) => sum + h.value, 0);

  return raw.map((h) => ({
    id: `${cik}-${h.cusip}-${filing.reportDate}`,
    fundName,
    ticker: cusipToTicker(h.cusip, h.nameOfIssuer),
    cusip: h.cusip,
    valueUsd: h.value,
    shares: h.shares,
    pctOfPortfolio: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
    reportedAt: filing.reportDate,
  }));
}

export async function getHedgeFundSignal(
  ticker: string
): Promise<HedgeFundSignal> {
  const db = getDb();
  const upper = ticker.toUpperCase();

  let rows: Array<{ fund_name: string; value_usd: number }> = [];
  try {
    rows = db
      .prepare(
        "SELECT fund_name, value_usd FROM hedge_fund_holdings WHERE ticker = ?"
      )
      .all(upper) as Array<{ fund_name: string; value_usd: number }>;
  } catch {
    // Table may not exist yet
  }

  const trackedBy = [...new Set(rows.map((r) => r.fund_name))];
  const totalValue = rows.reduce((sum, r) => sum + (r.value_usd ?? 0), 0);

  return {
    ticker: upper,
    trackedBy,
    totalValue,
    signal: trackedBy.length >= 2 ? "SMART_MONEY" : "NONE",
  };
}

export async function refreshAllFunds(): Promise<void> {
  const db = getDb();

  for (const fund of TRACKED_FUNDS) {
    try {
      const holdings = await fetchHedgeFundHoldings(fund.cik);

      for (const h of holdings) {
        if (!h.ticker) continue;
        try {
          db.prepare(
            `INSERT OR REPLACE INTO hedge_fund_holdings
             (id, fund_name, ticker, cusip, value_usd, shares, pct_of_portfolio, reported_at, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).run(
            h.id,
            h.fundName,
            h.ticker,
            h.cusip,
            h.valueUsd,
            h.shares,
            h.pctOfPortfolio,
            h.reportedAt
          );
        } catch {
          // Skip individual row errors
        }
      }
    } catch (err) {
      console.error(`hedgeFundService: failed to refresh ${fund.name}:`, err);
    }
  }
}

export async function getCachedHoldings(): Promise<HedgeFundHolding[]> {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT id, fund_name, ticker, cusip, value_usd, shares, pct_of_portfolio, reported_at
         FROM hedge_fund_holdings
         ORDER BY value_usd DESC`
      )
      .all() as Array<{
        id: string;
        fund_name: string;
        ticker: string;
        cusip: string;
        value_usd: number;
        shares: number;
        pct_of_portfolio: number;
        reported_at: string;
      }>;

    return rows.map((r) => ({
      id: r.id,
      fundName: r.fund_name,
      ticker: r.ticker,
      cusip: r.cusip,
      valueUsd: r.value_usd,
      shares: r.shares,
      pctOfPortfolio: r.pct_of_portfolio,
      reportedAt: r.reported_at,
    }));
  } catch {
    return [];
  }
}
