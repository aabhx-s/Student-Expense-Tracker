const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");

// GET /transactions/
router.get("/", async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 }).limit(50);
    const formatted = transactions.map((t) => ({
      id: t._id,
      amount: t.amount,
      type: t.type,
      merchant: t.merchant,
      category: t.category,
      date: t.date.toISOString().split("T")[0],
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// POST /transactions/ (for adding test data)
router.post("/", async (req, res) => {
  try {
    const transaction = new Transaction(req.body);
    await transaction.save();
    res.status(201).json(transaction);
  } catch (err) {
    res.status(400).json({ detail: err.message });
  }
});

module.exports = router;