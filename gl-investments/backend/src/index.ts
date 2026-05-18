import express from "express";
import cors from "cors";
import { initDb } from "./services/database";
import marketRoutes from "./routes/market";
import portfolioRoutes from "./routes/portfolio";
import watchlistRoutes from "./routes/watchlist";
import aiRoutes from "./routes/ai";
import congressRoutes from "./routes/congress";
import commoditiesRoutes from "./routes/commodities";
import signalsRoutes from "./routes/signals";
import settingsRoutes from "./routes/settings";
import ipoRoutes from "./routes/ipo";
import predictionsRoutes from "./routes/predictions";
import intelligenceRoutes from "./routes/intelligence";
import riskRoutes from "./routes/risk";
import apexRoutes from "./routes/apex";
import decisionsRoutes from "./routes/decisions";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.use("/api/market", marketRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/congress", congressRoutes);
app.use("/api/commodities", commoditiesRoutes);
app.use("/api/signals", signalsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/ipo", ipoRoutes);
app.use("/api/predictions", predictionsRoutes);

app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/risk", riskRoutes);
app.use("/api/apex", apexRoutes);
app.use("/api/decisions", decisionsRoutes);

app.get("/api/health", (_req, res) => res.json({ status: "ok", version: "3.0.0" }));

initDb();

app.listen(PORT, () => {
  console.log(`G&L Investments API running on :${PORT}`);
});
