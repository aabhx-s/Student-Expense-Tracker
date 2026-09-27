const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");

// GET /dashboard/home
router.get("/home", async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const transactions = await Transaction.find({ date: { $gte: start, $lte: end } });

    let income = 0, expense = 0;
    const category_breakdown = {};
    const daily_spending = {};

    transactions.forEach((t) => {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;

      if (t.type === "expense") {
        category_breakdown[t.category] = (category_breakdown[t.category] || 0) + t.amount;
        const day = t.date.toISOString().split("T")[0];
        daily_spending[day] = (daily_spending[day] || 0) + t.amount;
      }
    });

    const savings = income - expense;
    const budget_alerts = [];
    const BUDGET_LIMIT = 15000;

    if (expense > BUDGET_LIMIT * 0.9)
      budget_alerts.push(`Warning: Spent INR ${expense.toFixed(2)} of INR ${BUDGET_LIMIT} budget`);

    const low_balance_warning = savings < 2000
      ? `Low balance: INR ${savings.toFixed(2)} remaining`
      : null;

    res.json({
      monthly_summary: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        income,
        expense,
        savings,
        category_breakdown,
        daily_spending,
      },
      budget_alerts,
      low_balance_warning,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// GET /dashboard/analytics
router.get("/analytics", async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Week range
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    const [monthlyTxns, weeklyTxns] = await Promise.all([
      Transaction.find({ date: { $gte: monthStart }, type: "expense" }),
      Transaction.find({ date: { $gte: weekStart }, type: "expense" }),
    ]);

    let expense = 0;
    const category_breakdown = {};
    const daily_spending = {};

    monthlyTxns.forEach((t) => {
      expense += t.amount;
      category_breakdown[t.category] = (category_breakdown[t.category] || 0) + t.amount;
      const day = t.date.toISOString().split("T")[0];
      daily_spending[day] = (daily_spending[day] || 0) + t.amount;
    });

    const weekMap = {};
    weeklyTxns.forEach((t) => {
      weekMap[t.category] = (weekMap[t.category] || 0) + t.amount;
    });

    const top_categories_week = Object.entries(weekMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    res.json({ expense, category_breakdown, daily_spending, top_categories_week });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;