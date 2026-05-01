const Groq = require("groq-sdk");

/**
 * POST /today
 *
 * Generates a structured "What should I do today?" plan based on
 * current weather + optional user preferences.
 *
 * Request body:
 *   weather     (required) — OWM weather object
 *   unit        (optional) — "metric" | "imperial"
 *   preferences (optional) — free-text user preferences, e.g. "I like running and cycling"
 *
 * Response:
 * {
 *   overview: string,           // 1-2 sentence day summary
 *   timeWindows: [              // best time slots for being outside
 *     { time: string, label: string, quality: "good"|"fair"|"poor" }
 *   ],
 *   activities: [               // activity suitability cards
 *     { name: string, suitable: boolean, reason: string, icon: string }
 *   ],
 *   tips: string[]              // 2-3 practical tips for the day
 * }
 */
function buildTodayPrompt(weather, unit, preferences) {
  const tempUnit = unit === "imperial" ? "°F" : "°C";
  const speedUnit = unit === "imperial" ? "mph" : "m/s";
  const { main, wind, clouds, visibility, weather: conditions, sys, rain } = weather;

  const sunrise = new Date(sys.sunrise * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sunset  = new Date(sys.sunset  * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const context = `
Current weather in ${weather.name}, ${sys.country}:
- Condition: ${conditions[0].description}
- Temperature: ${Math.round(main.temp)}${tempUnit} (feels like ${Math.round(main.feels_like)}${tempUnit})
- High / Low: ${Math.round(main.temp_max)}${tempUnit} / ${Math.round(main.temp_min)}${tempUnit}
- Humidity: ${main.humidity}%
- Wind: ${wind.speed} ${speedUnit}${wind.gust ? `, gusts ${wind.gust} ${speedUnit}` : ""}
- Visibility: ${(visibility / 1000).toFixed(1)} km
- Cloud cover: ${clouds.all}%
${rain ? `- Rainfall: ${rain["1h"] ?? rain["3h"]} mm` : ""}
- Sunrise: ${sunrise}, Sunset: ${sunset}
${preferences ? `\nUser preferences: ${preferences}` : ""}
`.trim();

  return `${context}

Based on this weather, generate a "What should I do today?" plan.
Respond with raw JSON only (no markdown, no code fences):
{
  "overview": "1-2 sentence summary of what kind of day it is and general advice",
  "timeWindows": [
    { "time": "Morning (6am-12pm)", "label": "short description", "quality": "good" },
    { "time": "Afternoon (12pm-6pm)", "label": "short description", "quality": "fair" },
    { "time": "Evening (6pm-10pm)", "label": "short description", "quality": "poor" }
  ],
  "activities": [
    { "name": "Running", "suitable": true, "reason": "one short sentence", "icon": "🏃" },
    { "name": "Walking", "suitable": true, "reason": "one short sentence", "icon": "🚶" },
    { "name": "Cycling", "suitable": false, "reason": "one short sentence", "icon": "🚴" },
    { "name": "Commuting", "suitable": true, "reason": "one short sentence", "icon": "🚌" },
    { "name": "Outdoor Dining", "suitable": false, "reason": "one short sentence", "icon": "🍽️" },
    { "name": "Picnic", "suitable": false, "reason": "one short sentence", "icon": "🧺" }
  ],
  "tips": ["tip 1", "tip 2", "tip 3"]
}

Use "good", "fair", or "poor" for quality. Tailor activities to user preferences if provided.`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { weather, unit, preferences } = req.body;
  if (!weather) return res.status(400).json({ error: "Weather data is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI not configured" });

  try {
    const groq = new Groq({ apiKey });
    const prompt = buildTodayPrompt(weather, unit || "metric", preferences);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
    });

    const text = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate today plan" });
  }
};
