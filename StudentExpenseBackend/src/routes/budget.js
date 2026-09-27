const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");

const BUDGET_LIMITS = {
  Food: 4000,
  Transport: 2000,
  Entertainment: 1500,
  Study: 3000,
  Other: 2000,
};

// GET /budgets/alerts
router.get("/alerts", async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    const transactions = await Transaction.find({
      date: { $gte: start },
      type: "expense",
    });

    const spending_by_category = {};
    transactions.forEach((t) => {
      spending_by_category[t.category] = (spending_by_category[t.category] || 0) + t.amount;
    });

    const alerts = [];
    Object.entries(spending_by_category).forEach(([cat, spent]) => {
      const limit = BUDGET_LIMITS[cat];
      if (limit && spent > limit * 0.8) {
        alerts.push(`${cat}: Spent INR ${spent.toFixed(2)} of INR ${limit} budget`);
      }
    });

    // Carry forward: last month's savings
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthTxns = await Transaction.find({
      date: { $gte: lastMonthStart, $lte: lastMonthEnd },
    });

    let lastIncome = 0, lastExpense = 0;
    lastMonthTxns.forEach((t) => {
      if (t.type === "income") lastIncome += t.amount;
      else lastExpense += t.amount;
    });

    const carry_forward_savings = Math.max(0, lastIncome - lastExpense);

    res.json({ spending_by_category, alerts, carry_forward_savings });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;