require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// =========================
// Test DB Connection
// =========================
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB connection failed" });
  }
});

// =========================
// REGISTER API
// =========================
app.post("/api/auth/register", async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    // Check if user already exists
    const userCheck = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      "INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, full_name, email",
      [full_name, email, hashedPassword]
    );

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

// =========================
// LOGIN API
// =========================
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const userRes = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const user = userRes.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid password" });
    }

    res.json({
      success: true,
      userId: user.id,
      full_name: user.full_name,
      email: user.email,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// =========================
// ADD TRADE
// =========================
app.post("/api/trades", async (req, res) => {
  try {
    const {
      user_id,
      trade_date,
      pair,
      trade_type,
      entry_price,
      exit_price,
      lot_size,
      stop_loss,
      take_profit,
      notes
    } = req.body;

    let profit_loss = 0;

    if (trade_type === 'Buy') {
      profit_loss = (exit_price - entry_price) * 100 * lot_size;
    } else if (trade_type === 'Sell') {
      profit_loss = (entry_price - exit_price) * 100 * lot_size;
    }

    const result = await pool.query(
      `INSERT INTO trades 
       (user_id, trade_date, pair, trade_type, entry_price, exit_price, lot_size, stop_loss, take_profit, profit_loss, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        user_id,
        trade_date,
        pair,
        trade_type,
        entry_price,
        exit_price,
        lot_size,
        stop_loss,
        take_profit,
        profit_loss,
        notes
      ]
    );

    res.json({ success: true, trade: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add trade" });
  }
});


// =========================
// GET ALL TRADES BY USER
// =========================
app.get("/api/trades/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      "SELECT * FROM trades WHERE user_id = $1 ORDER BY trade_date DESC",
      [userId]
    );

    res.json({ success: true, trades: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trades" });
  }
});

// =========================
// DELETE TRADE
// =========================
app.delete("/api/trades/:tradeId", async (req, res) => {
  try {
    const { tradeId } = req.params;

    await pool.query("DELETE FROM trades WHERE id = $1", [tradeId]);

    res.json({ success: true, message: "Trade deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete trade" });
  }
});

// =========================
// ADD JOURNAL ENTRY
// =========================
app.post("/api/journal", async (req, res) => {
  try {
    const {
      user_id,
      entry_date,
      emotion_before,
      emotion_after,
      lesson_learned
    } = req.body;

    const result = await pool.query(
      `INSERT INTO journal_entry 
      (user_id, entry_date, emotion_before, emotion_after, lesson_learned)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *`,
      [user_id, entry_date, emotion_before, emotion_after, lesson_learned]
    );

    res.json({ success: true, entry: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add journal entry" });
  }
});

// =========================
// GET JOURNAL ENTRIES
// =========================
app.get("/api/journal/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      "SELECT * FROM journal_entry WHERE user_id = $1 ORDER BY entry_date DESC",
      [userId]
    );

    res.json({ success: true, entries: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch journal" });
  }
});

// =========================
// WEEKLY SUMMARY
// =========================
app.get("/api/summary/weekly/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `
      SELECT 
        COUNT(*) AS total_trades,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) AS losses,
        SUM(profit_loss) AS net_profit
      FROM trades
      WHERE user_id = $1
      AND trade_date >= CURRENT_DATE - INTERVAL '7 days'
      `,
      [userId]
    );

    res.json({ success: true, summary: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get summary" });
  }
});

// =========================
// DASHBOARD STATS
// =========================
app.get("/api/dashboard/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `
      SELECT 
        COUNT(*) AS total_trades,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) AS losses,
        COALESCE(SUM(profit_loss),0) AS net_profit
      FROM trades
      WHERE user_id = $1
      `,
      [userId]
    );

    res.json({ success: true, stats: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Dashboard stats failed" });
  }
});

// =========================
// EQUITY CURVE
// =========================
app.get("/api/equity/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `
      SELECT trade_date, profit_loss
      FROM trades
      WHERE user_id = $1
      ORDER BY trade_date ASC
      `,
      [userId]
    );

    let equity = 0;
    const curve = result.rows.map(t => {
      equity += Number(t.profit_loss);
      return { date: t.trade_date, equity };
    });

    res.json({ success: true, curve });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Equity curve failed" });
  }
});

// =========================
// BEST & WORST TRADE
// =========================
app.get("/api/trades/best-worst/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const best = await pool.query(
      "SELECT * FROM trades WHERE user_id = $1 ORDER BY profit_loss DESC LIMIT 1",
      [userId]
    );

    const worst = await pool.query(
      "SELECT * FROM trades WHERE user_id = $1 ORDER BY profit_loss ASC LIMIT 1",
      [userId]
    );

    res.json({
      success: true,
      best: best.rows[0],
      worst: worst.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Best/Worst failed" });
  }
});

// =========================
// MONTHLY SUMMARY
// =========================
app.get("/api/summary/monthly/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `
      SELECT 
        DATE_TRUNC('month', trade_date) AS month,
        COUNT(*) AS total_trades,
        SUM(profit_loss) AS net_profit
      FROM trades
      WHERE user_id = $1
      GROUP BY month
      ORDER BY month DESC
      `,
      [userId]
    );

    res.json({ success: true, summary: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Monthly summary failed" });
  }
});

// =========================
// UPDATE TRADE
// =========================
app.put("/api/trades/:tradeId", async (req, res) => {
  try {
    const { tradeId } = req.params;

    const {
      trade_date,
      pair,
      trade_type,
      entry_price,
      exit_price,
      lot_size,
      stop_loss,
      take_profit,
      notes
    } = req.body;

    let profit_loss = 0;

    if (trade_type === 'Buy') {
      profit_loss = (exit_price - entry_price) * 100 * lot_size;
    } else if (trade_type === 'Sell') {
      profit_loss = (entry_price - exit_price) * 100 * lot_size;
    }

    const result = await pool.query(
      `UPDATE trades 
       SET trade_date=$1, pair=$2, trade_type=$3, entry_price=$4, exit_price=$5,
           lot_size=$6, stop_loss=$7, take_profit=$8, profit_loss=$9, notes=$10
       WHERE id=$11
       RETURNING *`,
      [
        trade_date,
        pair,
        trade_type,
        entry_price,
        exit_price,
        lot_size,
        stop_loss,
        take_profit,
        profit_loss,
        notes,
        tradeId
      ]
    );

    res.json({ success: true, trade: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update trade" });
  }
});



// =========================
// Server Start
// =========================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
 console.log(`🚀 Server running on port ${PORT}`);

});
