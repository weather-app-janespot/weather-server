const Groq = require("groq-sdk");

/**
 * POST /activities
 *
 * Returns 3–5 ranked outdoor activity suggestions based on current weather.
 * Works with or without a user profile.
 *
 * Request body:
 *   weather     (required) — OWM weather object
 *   unit        (optional) — "metric" | "imperial"
 *   preferences (optional) — profile prompt string
 *
 * Response:
 * {
 *   activities: [
 *     {
 *       rank: number,
 *       name: string,
 *       icon: string,
 *       score: number,        // 0–100 suitability
 *       reasoning: string,    // why this activity fits the weather
 *       bestWindow: string,   // e.g. "7am–10am"
 *       tips: string          // one practical tip
 *     }
 *   ]
 * }
 */
function buildPrompt(weather, unit, preferences) {
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

Suggest the 3–5 best outdoor activities for today ranked by suitability.
${preferences ? "Prioritise activities matching the user preferences, but include generic options too." : "Suggest generic activities suitable for most people."}

Respond with raw JSON only (no markdown, no code fences):
{
  "activities": [
    {
      "rank": 1,
      "name": "Morning Run",
      "icon": "🏃",
      "score": 88,
      "reasoning": "2 sentences explaining why this activity suits today's weather",
      "bestWindow": "6am–9am",
      "tips": "one practical tip for doing this activity today"
    }
  ]
}

Rules:
- rank 1 = best suited, descending
- score 0–100 reflecting weather suitability (not personal preference)
- bestWindow must reference actual times based on sunrise/sunset
- reasoning must be specific to the weather data, not generic
- Only suggest activities that are genuinely feasible today`;
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
    const prompt = buildPrompt(weather, unit || "metric", preferences);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.65,
    });

    const text = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate activities" });
  }
};
