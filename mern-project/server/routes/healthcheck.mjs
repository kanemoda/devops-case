import express from "express";
import db from "../db/conn.mjs";

const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).json({
    uptime: process.uptime(),
    message: "OK",
    timestamp: Date.now(),
  });
});

router.get("/ready", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.status(200).json({ status: "ready" });
  } catch (err) {
    res.status(503).json({ status: "unavailable", error: err.message });
  }
});

export default router;
