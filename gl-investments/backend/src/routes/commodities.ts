import { Router } from "express";
import { getAllCommodities, getCommodityCategory, listCategories } from "../services/commoditiesService";

const router = Router();

// GET /api/commodities/all
router.get("/all", async (_req, res) => {
  try {
    const data = await getAllCommodities();
    res.json(data);
  } catch (err) {
    console.error("commodities/all error:", err);
    res.status(500).json({ error: "Failed to fetch commodity data" });
  }
});

// GET /api/commodities/:category
router.get("/:category", async (req, res) => {
  const category = req.params.category.toLowerCase();
  const valid = listCategories();

  if (!valid.includes(category)) {
    return res.status(404).json({
      error: `Unknown category. Valid: ${valid.join(", ")}`,
    });
  }

  try {
    const data = await getCommodityCategory(category);
    if (!data) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(data);
  } catch (err) {
    console.error("commodities/:category error:", err);
    res.status(500).json({ error: "Failed to fetch commodity category" });
  }
});

export default router;
