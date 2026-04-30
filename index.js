const express = require('express');
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config(); // Load WEATHER_API_KEY from .env into process.env

const app = express();

// Allow cross-origin requests from the React dev server (localhost:5173)
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Load city list once at startup — reused across all /cities requests
let cities = null;
function getCities() {
  if (!cities) {
    cities = JSON.parse(fs.readFileSync(path.join(__dirname, "city.list.json"), "utf-8"));
  }
  return cities;
}

/**
 * GET /cities?q=lon&limit=8
 * Returns cities whose names start with the query string (case/accent-insensitive).
 */
app.get("/cities", (req, res) => {
  const { q, limit } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query must be at least 2 characters" });
  }
  const maxResults = Math.min(parseInt(limit) || 8, 20);
  const normalise = (str) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const needle = normalise(q.trim());
  const results = [];
  const seen = new Set();
  for (const city of getCities()) {
    if (results.length >= maxResults) break;
    if (!normalise(city.name).startsWith(needle)) continue;
    const key = `${normalise(city.name)}|${city.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ id: city.id, name: city.name, state: city.state, country: city.country });
  }
  res.json(results);
});


/**
 * GET /weather
 *
 * Local development equivalent of api/weather.js.
 * Proxies the request to OpenWeatherMap and returns the response.
 * For production, use the Vercel serverless function in api/weather.js instead.
 *
 * Query params:
 *   city  (required) — city name, e.g. "London"
 *   units (optional) — defaults to "metric" here; extend as needed
 */
app.get("/weather", async (req, res) => {
    const { city, units } = req.query;
    const apiKey = process.env.WEATHER_API_KEY;

    if (!city || !city.trim()) {
        return res.status(400).json({ error: "City parameter is required" });
    }

    if (!apiKey) {
        return res.status(500).json({ error: "API key not configured" });
    }

    const unitParam = units === "imperial" ? "imperial" : "metric";

    try {
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${unitParam}&appid=${apiKey}`
        );
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || "Failed to fetch weather data";
        res.status(status).json({ error: message });
    }
});

const aiHandler = require("./api/ai");

/**
 * POST /ai
 * Proxies to the shared ai handler (same as Vercel serverless function).
 */
app.post("/ai", (req, res) => aiHandler(req, res));

app.listen(PORT, () => console.log(`Listening to port ${PORT}`));
