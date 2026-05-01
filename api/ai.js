const Groq = require("groq-sdk");

/**
 * Builds the prompt sent to the LLM.
 * Structured mode returns JSON summary/recommendation/bestTime.
 * Question mode returns a direct conversational answer.
 */
function buildPrompt(weather, unit, question, preferences) {
  const tempUnit = unit === "imperial" ? "°F" : "°C";
  const speedUnit = unit === "imperial" ? "mph" : "m/s";
  const { main, wind, clouds, visibility, weather: conditions, sys, rain } = weather;

  const context = `
Current weather in ${weather.name}, ${sys.country}:
- Condition: ${conditions[0].description}
- Temperature: ${Math.round(main.temp)}${tempUnit} (feels like ${Math.round(main.feels_like)}${tempUnit})
- High / Low: ${Math.round(main.temp_max)}${tempUnit} / ${Math.round(main.temp_min)}${tempUnit}
- Humidity: ${main.humidity}%
- Wind: ${wind.speed} ${speedUnit}${wind.gust ? `, gusts ${wind.gust} ${speedUnit}` : ""}
- Visibility: ${(visibility / 1000).toFixed(1)} km
- Cloud cover: ${clouds.all}%
${rain ? `- Rainfall: ${rain["1h"] ?? rain["3h"]} mm (${rain["1h"] !== undefined ? "last 1h" : "last 3h"})` : ""}
- Sunrise: ${new Date(sys.sunrise * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
- Sunset: ${new Date(sys.sunset * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
`.trim();

  if (question) {
    const prefLine = preferences ? `\nUser profile: ${preferences}` : ""
    return `${context}${prefLine}\n\nThe user asks: "${question}"\n\nAnswer directly and concisely in 2-3 sentences, taking their profile into account if relevant.`
  }

  return `${context}

Respond with raw JSON only (no markdown, no code fences):
{
  "summary": "2-sentence natural language description of current conditions",
  "recommendation": "one clear sentence — should they go outside or stay in?",
  "bestTime": "best time of day for outdoor activity based on sunrise/sunset and conditions, one sentence"
}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { weather, unit, question, preferences } = req.body;
  if (!weather) return res.status(400).json({ error: "Weather data is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI not configured" });

  try {
    const groq = new Groq({ apiKey });
    const prompt = buildPrompt(weather, unit || "metric", question, preferences);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const text = completion.choices[0].message.content.trim();

    if (question) {
      return res.json({ answer: text });
    }

    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate AI response" });
  }
};
