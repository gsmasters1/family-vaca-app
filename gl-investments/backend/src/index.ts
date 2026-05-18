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

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

initDb();

app.listen(PORT, () => {
  console.log(`G&L Investments API running on :${PORT}`);
});
