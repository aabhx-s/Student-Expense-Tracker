const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");

// GET /reports/semester?semester=1&year=2026
router.get("/semester", async (req, res) => {
  try {
    const semester = parseInt(req.query.semester) || 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Semester 1: Jan-Jun, Semester 2: Jul-Dec
    const startMonth = semester === 1 ? 0 : 6;
    const endMonth = semester === 1 ? 5 : 11;

    const start = new Date(year, startMonth, 1);
    const end = new Date(year, endMonth + 1, 0);

    const transactions = await Transaction.find({ date: { $gte: start, $lte: end } });

    let income = 0, expense = 0;
    transactions.forEach((t) => {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    });

    res.json({
      semester,
      year,
      count: transactions.length,
      expense,
      income,
      net: income - expense,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// GET /reports/export/csv
router.get("/export/csv", async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    const header = "id,amount,type,merchant,category,date";
    const rows = transactions.map(
      (t) => `${t._id},${t.amount},${t.type},${t.merchant},${t.category},${t.date.toISOString().split("T")[0]}`
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=transactions.csv");
    res.send([header, ...rows].join("\n"));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// GET /reports/export/pdf (returns JSON summary for now)
router.get("/export/pdf", async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    let income = 0, expense = 0;
    transactions.forEach((t) => {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    });
    res.json({
      report: "Student Expense Report",
      total_income: income,
      total_expense: expense,
      net_savings: income - expense,
      transaction_count: transactions.length,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;