import express from "express";
import pkg from "pg";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/bookings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM homestay_bookings ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

app.post("/bookings", async (req, res) => {
  try {
    const { guest_name, persons, check_in_date } = req.body;

    if (!guest_name || !persons || !check_in_date) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const result = await pool.query(
      "INSERT INTO homestay_bookings (guest_name, persons, check_in_date) VALUES ($1,$2,$3) RETURNING *",
      [guest_name, persons, check_in_date]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});