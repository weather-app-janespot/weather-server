const path = require("path");
const fs = require("fs");

// Load and parse city.list.json once at cold-start, not on every request.
// The file sits at the server root, one level above this api/ directory.
let cities = null;

function getCities() {
  if (!cities) {
    const filePath = path.join(__dirname, "..", "city.list.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    cities = JSON.parse(raw);
  }
  return cities;
}

/**
 * Vercel serverless function — GET /cities
 *
 * Returns up to `limit` cities whose names start with the given query string.
 * Matching is case-insensitive and accent-insensitive (via Unicode normalisation).
 *
 * Query params:
 *   q     (required) — search string, e.g. "lon"
 *   limit (optional) — max results to return, default 8, max 20
 *
 * Response: Array of { id, name, state, country }
 */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { q, limit } = req.query;

  if (!q || q.trim().length < 2) {
    // Require at least 2 characters to avoid returning thousands of results
    return res.status(400).json({ error: "Query must be at least 2 characters" });
  }

  const maxResults = Math.min(parseInt(limit) || 8, 20);

  // Normalise the query: lowercase + strip diacritics (e.g. "lon" matches "London")
  const normalise = (str) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const needle = normalise(q.trim());
  const allCities = getCities();
  const results = [];

  // Single-pass linear scan — fast enough for ~200k entries on a warm function instance.
  // Prefix match is prioritised: "lon" → "London" before "Salon-de-Provence".
  for (let i = 0; i < allCities.length && results.length < maxResults; i++) {
    const city = allCities[i];
    if (normalise(city.name).startsWith(needle)) {
      results.push({
        id: city.id,
        name: city.name,
        state: city.state,
        country: city.country,
      });
    }
  }

  res.json(results);
};
