const Groq = require("groq-sdk");

/**
 * POST /timeline
 *
 * Generates a narrative weather story timeline for the day,
 * broken into hourly-ish blocks from pre-dawn to late night.
 *
 * Response:
 * {
 *   blocks: [
 *     {
 *       time: string,           // e.g. "5am–7am"
 *       label: string,          // e.g. "Pre-dawn calm"
 *       story: string,          // 1-2 sentence narrative
 *       icon: string,           // emoji representing the period
 *       temp: string,           // e.g. "17°C"
 *       condition: string,      // e.g. "Clear"
 *       wind: string,           // e.g. "Light breeze"
 *       highlight: boolean      // true for the best time of day
 *     }
 *   ]
 * }
 */
function buildTimelinePrompt(weather, unit) {
  const tempUnit = unit === "imperial" ? "°F" : "°C";
  const speedUnit = unit === "imperial" ? "mph" : "m/s";
  const { main, wind, clouds, visibility, weather: conditions, sys, rain } = weather;

  const sunrise = new Date(sys.sunrise * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sunset  = new Date(sys.sunset  * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const now     = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const context = `
Current weather in ${weather.name}, ${sys.country} at ${now}:
- Condition: ${conditions[0].description}
- Temperature: ${Math.round(main.temp)}${tempUnit} (feels like ${Math.round(main.feels_like)}${tempUnit})
- High / Low: ${Math.round(main.temp_max)}${tempUnit} / ${Math.round(main.temp_min)}${tempUnit}
- Humidity: ${main.humidity}%
- Wind: ${wind.speed} ${speedUnit}${wind.gust ? `, gusts ${wind.gust} ${speedUnit}` : ""}
- Visibility: ${(visibility / 1000).toFixed(1)} km
- Cloud cover: ${clouds.all}%
${rain ? `- Rainfall: ${rain["1h"] ?? rain["3h"]} mm` : ""}
- Sunrise: ${sunrise}, Sunset: ${sunset}
`.trim();

  return `${context}

Generate a weather story timeline for today with 6 time blocks covering the full day.
Use the sunrise/sunset times to determine day/night periods accurately.
Mark the single best time block as highlight: true.

Respond with raw JSON only (no markdown, no code fences):
{
  "blocks": [
    {
      "time": "5am–8am",
      "label": "Early morning",
      "story": "1-2 sentence narrative describing what it feels like to be outside at this time",
      "icon": "🌅",
      "temp": "${Math.round(main.temp_min)}${tempUnit}",
      "condition": "Clear skies",
      "wind": "Calm",
      "highlight": false
    }
  ]
}

Rules:
- Exactly 6 blocks covering the full day (e.g. 5am-8am, 8am-12pm, 12pm-3pm, 3pm-6pm, 6pm-9pm, 9pm-12am)
- Story must be vivid and human — describe the feel, not just the data
- Vary temperatures realistically across the day (cooler morning, warmer afternoon, cooling evening)
- Only one block has highlight: true — the genuinely best time to be outside
- Icons should match the period (sunrise, sun, clouds, rain, moon, stars etc.)
- Wind descriptions: "Calm", "Light breeze", "Moderate wind", "Strong wind", "Gusty"`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { weather, unit } = req.body;
  if (!weather) return res.status(400).json({ error: "Weather data is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI not configured" });

  try {
    const groq = new Groq({ apiKey });
    const prompt = buildTimelinePrompt(weather, unit || "metric");

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const text = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate timeline" });
  }
};
