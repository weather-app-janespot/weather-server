const { connectDB, WeatherMemory } = require("../lib/db");
const { verifyToken } = require("../lib/authMiddleware");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

function toC(temp, unit) {
  return unit === "imperial" ? (temp - 32) * 5 / 9 : temp;
}

/**
 * POST /memory — record a weather search event
 * GET  /memory — get memory summary for AI context
 * DELETE /memory — clear all memory for user
 */
module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: "Unauthorised" });

  await connectDB();

  // POST — record a search
  if (req.method === "POST") {
    const { weather, unit } = req.body;
    if (!weather) return res.status(400).json({ error: "Weather data required" });

    const day = new Date().getDay();
    await WeatherMemory.create({
      userId:      payload.userId,
      city:        weather.name,
      country:     weather.sys.country,
      conditionId: weather.weather[0].id,
      condition:   weather.weather[0].description,
      tempC:       Math.round(toC(weather.main.temp, unit || "metric") * 10) / 10,
      humidity:    weather.main.humidity,
      windMs:      unit === "imperial" ? weather.wind.speed * 0.44704 : weather.wind.speed,
      timeOfDay:   getTimeOfDay(),
      isWeekend:   day === 0 || day === 6,
    });

    // Keep only the last 100 entries per user
    const count = await WeatherMemory.countDocuments({ userId: payload.userId });
    if (count > 100) {
      const oldest = await WeatherMemory
        .find({ userId: payload.userId })
        .sort({ searchedAt: 1 })
        .limit(count - 100)
        .select("_id");
      await WeatherMemory.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
    }

    return res.status(201).json({ ok: true });
  }

  // GET — return summary for AI context
  if (req.method === "GET") {
    const entries = await WeatherMemory
      .find({ userId: payload.userId })
      .sort({ searchedAt: -1 })
      .limit(50)
      .lean();

    if (entries.length === 0) return res.json({ summary: null, entries: [] });

    // Derive patterns
    const cities = [...new Set(entries.map(e => e.city))];
    const temps = entries.map(e => e.tempC).filter(Boolean);
    const avgTemp = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null;
    const timeFreq = entries.reduce((acc, e) => { acc[e.timeOfDay] = (acc[e.timeOfDay] || 0) + 1; return acc; }, {});
    const preferredTime = Object.entries(timeFreq).sort((a, b) => b[1] - a[1])[0]?.[0];
    const weekendCount = entries.filter(e => e.isWeekend).length;
    const conditions = entries.map(e => e.condition);
    const condFreq = conditions.reduce((acc, c) => { acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const topCondition = Object.entries(condFreq).sort((a, b) => b[1] - a[1])[0]?.[0];

    const summary = [
      `User has searched weather ${entries.length} times.`,
      cities.length > 1 ? `Frequently checked cities: ${cities.slice(0, 5).join(", ")}.` : `Usually checks ${cities[0]}.`,
      avgTemp !== null ? `Average temperature when searching: ${avgTemp}°C.` : "",
      preferredTime ? `Most active at: ${preferredTime}.` : "",
      weekendCount > entries.length * 0.5 ? "Tends to check weather on weekends." : "Mostly checks on weekdays.",
      topCondition ? `Most common condition encountered: ${topCondition}.` : "",
    ].filter(Boolean).join(" ");

    return res.json({ summary, entries: entries.slice(0, 10) });
  }

  // DELETE — clear memory
  if (req.method === "DELETE") {
    await WeatherMemory.deleteMany({ userId: payload.userId });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
