const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/dashboard", require("./routes/dashboard"));
app.use("/transactions", require("./routes/transactions"));
app.use("/budgets", require("./routes/budget"));
app.use("/reports", require("./routes/reports.js"));

// Health check
app.get("/", (req, res) => res.json({ status: "StudentExpense API running" }));

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });