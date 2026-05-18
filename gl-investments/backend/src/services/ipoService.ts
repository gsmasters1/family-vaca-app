import axios from "axios";
import { getDb } from "./database";
import { getOllamaConfig } from "./appConfig";

const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";
const EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions";

export interface IpoFiling {
  id: string;
  companyName: string;
  ticker: string;
  filingDate: string;
  formType: string;
  estimatedIpoDate: string;
  priceRangeLow: number;
  priceRangeHigh: number;
  sharesOffered: number;
  aiScore: number;
  aiAnalysis: string;
  status: "pending" | "priced" | "trading" | "withdrawn" | "lockup_expiring";
  lockupExpiry: string;
  daysUntilLockupExpiry: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function daysFromNow(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export async function fetchRecentFilings(lookbackDays = 30): Promise<IpoFiling[]> {
  const db = getDb();
  const cacheAge = db
    .prepare(
      "SELECT MIN(fetched_at) as oldest FROM ipo_filings WHERE datetime(fetched_at, '+1 hour') > datetime('now')"
    )
    .get() as { oldest: string | null };

  if (cacheAge.oldest) {
    return getCachedFilings();
  }

  let raw: Array<{ _source: Record<string, string> }> = [];
  try {
    const url = `${EDGAR_SEARCH}?q=%22S-1%22&category=form-type&dateRange=custom&startdt=${daysAgo(lookbackDays)}&_source=file_date,entity_name,file_num,form_type`;
    const res = await axios.get(url, {
      timeout: 15_000,
      headers: { "User-Agent": "gl-investments-app/1.0 contact@example.com" },
    });
    raw = res.data?.hits?.hits ?? [];
  } catch {
    return getCachedFilings();
  }

  const filings: IpoFiling[] = raw.slice(0, 60).map((hit) => {
    const src = hit._source;
    const id = src.file_num ?? `${src.entity_name}-${src.file_date}`;
    const lockupDate = src.file_date
      ? new Date(
          new Date(src.file_date).getTime() + 180 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0]
      : "";

    return {
      id,
      companyName: src.entity_name ?? "Unknown",
      ticker: "",
      filingDate: src.file_date ?? "",
      formType: src.form_type ?? "S-1",
      estimatedIpoDate: "",
      priceRangeLow: 0,
      priceRangeHigh: 0,
      sharesOffered: 0,
      aiScore: 0,
      aiAnalysis: "",
      status: "pending" as const,
      lockupExpiry: lockupDate,
      daysUntilLockupExpiry: lockupDate ? daysFromNow(lockupDate) : 0,
    };
  });

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ipo_filings
      (id, company_name, ticker, filing_date, form_type, estimated_ipo_date,
       price_range_low, price_range_high, shares_offered, ai_score, ai_analysis,
       status, lockup_expiry)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const insertMany = db.transaction((rows: IpoFiling[]) => {
    for (const r of rows) {
      stmt.run(
        r.id, r.companyName, r.ticker, r.filingDate, r.formType,
        r.estimatedIpoDate, r.priceRangeLow, r.priceRangeHigh,
        r.sharesOffered, r.aiScore, r.aiAnalysis, r.status, r.lockupExpiry
      );
    }
  });
  insertMany(filings);

  return getCachedFilings();
}

function getCachedFilings(): IpoFiling[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM ipo_filings ORDER BY filing_date DESC LIMIT 100"
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    companyName: String(r.company_name),
    ticker: String(r.ticker ?? ""),
    filingDate: String(r.filing_date),
    formType: String(r.form_type),
    estimatedIpoDate: String(r.estimated_ipo_date ?? ""),
    priceRangeLow: Number(r.price_range_low),
    priceRangeHigh: Number(r.price_range_high),
    sharesOffered: Number(r.shares_offered),
    aiScore: Number(r.ai_score),
    aiAnalysis: String(r.ai_analysis ?? ""),
    status: String(r.status) as IpoFiling["status"],
    lockupExpiry: String(r.lockup_expiry ?? ""),
    daysUntilLockupExpiry: r.lockup_expiry ? daysFromNow(String(r.lockup_expiry)) : 0,
  }));
}

export async function scoreIpoWithAI(filing: IpoFiling): Promise<IpoFiling> {
  const { baseUrl, model } = getOllamaConfig();

  const prompt = `You are an IPO analyst. Score this IPO filing from the SEC EDGAR database.

Company: ${filing.companyName}
Filing Type: ${filing.formType}
Filing Date: ${filing.filingDate}
Lock-up Expiry (180 days post-filing estimate): ${filing.lockupExpiry}

Rate this IPO opportunity 1-10. Consider: company type from name, filing timing, lock-up expiry risk.
Respond with ONLY valid JSON:
{
  "score": <1-10>,
  "analysis": "<2-3 sentences on opportunity and risks>",
  "recommendation": "<Buy at IPO|Watch|Avoid|Wait for lock-up expiry dip>"
}`;

  try {
    const res = await axios.post(
      `${baseUrl}/api/chat`,
      { model, messages: [{ role: "user", content: prompt }], stream: false },
      { timeout: 60_000 }
    );
    const content: string = res.data.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    const updated = { ...filing, aiScore: parsed.score, aiAnalysis: parsed.analysis };
    getDb()
      .prepare(
        "UPDATE ipo_filings SET ai_score = ?, ai_analysis = ? WHERE id = ?"
      )
      .run(parsed.score, parsed.analysis, filing.id);
    return updated;
  } catch {
    return filing;
  }
}

export function getLockupExpiringFilings(withinDays = 30): IpoFiling[] {
  return getCachedFilings().filter(
    (f) => f.daysUntilLockupExpiry > 0 && f.daysUntilLockupExpiry <= withinDays
  );
}
