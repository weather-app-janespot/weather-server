const axios = require("axios");
const Groq = require("groq-sdk");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Derives a precipitation chance (0–100) from OWM condition ID.
 * OWM free tier doesn't include pop (probability of precipitation),
 * so we estimate from condition group.
 */
function precipChance(conditionId) {
  if (conditionId >= 200 && conditionId < 300) return 95; // thunderstorm
  if (conditionId >= 300 && conditionId < 400) return 70; // drizzle
  if (conditionId >= 500 && conditionId < 504) return 85; // rain
  if (conditionId === 511) return 90;                     // freezing rain
  if (conditionId >= 520 && conditionId < 532) return 80; // shower rain
  if (conditionId >= 600 && conditionId < 700) return 75; // snow
  if (conditionId >= 700 && conditionId < 800) return 20; // atmosphere
  if (conditionId === 800) return 0;                      // clear
  if (conditionId === 801) return 5;
  if (conditionId === 802) return 10;
  if (conditionId === 803) return 20;
  if (conditionId === 804) return 30;
  return 0;
}

/**
 * Comfort score 0–100 based on temp, humidity, wind, visibility.
 * Higher = more comfortable.
 */
function comfortScore(weather, unit) {
  const { main, wind, visibility } = weather;
  const tempC = unit === "imperial" ? (main.temp - 32) * 5 / 9 : main.temp;
  const feelsC = unit === "imperial" ? (main.feels_like - 32) * 5 / 9 : main.feels_like;
  const windMs = unit === "imperial" ? wind.speed * 0.44704 : wind.speed;

  // Temp score: ideal 18–24°C
  let tempScore = 100 - Math.min(100, Math.abs(feelsC - 21) * 4);

  // Humidity score: ideal 40–60%
  let humScore = 100 - Math.min(100, Math.abs(main.humidity - 50) * 1.5);

  // Wind score: ideal < 5 m/s
  let windScore = Math.max(0, 100 - windMs * 5);

  // Visibility score
  let visScore = Math.min(100, (visibility / 10000) * 100);

  // Precipitation penalty
  const precip = precipChance(weather.weather[0].id);
  let precipPenalty = precip * 0.4;

  const raw = (tempScore * 0.35 + humScore * 0.2 + windScore * 0.2 + visScore * 0.15) - precipPenalty * 0.1;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Best activity time label derived from sunrise/sunset and current conditions.
 */
function bestActivityTime(weather) {
  const { sys, weather: conditions } = weather;
  const conditionId = conditions[0].id;
  const sunrise = new Date(sys.sunrise * 1000);
  const sunset = new Date(sys.sunset * 1000);
  const sunriseStr = sunrise.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sunsetStr = sunset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (conditionId >= 200 && conditionId < 300) return "Indoors only";
  if (conditionId >= 500 && conditionId < 600) return "Early morning";
  if (conditionId === 800) return `${sunriseStr} – ${sunsetStr}`;
  return `${sunriseStr} – 12:00 PM`;
}

function buildComparePrompt(cities, unit) {
  const tempUnit = unit === "imperial" ? "°F" : "°C";
  const lines = cities.map((c, i) => {
    const { weather, score, precip } = c;
    return `City ${i + 1}: ${weather.name}, ${weather.sys.country}
  - Condition: ${weather.weather[0].description}
  - Temp: ${Math.round(weather.main.temp)}${tempUnit} (feels like ${Math.round(weather.main.feels_like)}${tempUnit})
  - Humidity: ${weather.main.humidity}%
  - Wind: ${weather.wind.speed} ${unit === "imperial" ? "mph" : "m/s"}
  - Precipitation chance: ${precip}%
  - Comfort score: ${score}/100`;
  }).join("\n\n");

  return `${lines}

Compare these cities and write a 2-3 sentence plain-language summary highlighting the key differences. 
Mention which city is best for outdoor activities today and why. Be specific and direct.
Respond with just the summary text, no JSON, no headers.`;
}

module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { cities, unit } = req.body;
  if (!cities || !Array.isArray(cities) || cities.length < 2 || cities.length > 4) {
    return res.status(400).json({ error: "Provide 2–4 city names" });
  }

  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Weather API key not configured" });

  const unitParam = unit === "imperial" ? "imperial" : "metric";

  try {
    // Fetch all cities in parallel
    const results = await Promise.allSettled(
      cities.map((city) =>
        axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
          params: { q: city, units: unitParam, appid: apiKey },
        })
      )
    );

    const cityData = results.map((r, i) => {
      if (r.status === "rejected") {
        return { error: `Could not fetch weather for "${cities[i]}"` };
      }
      const weather = r.value.data;
      return {
        weather,
        score: comfortScore(weather, unit || "metric"),
        precip: precipChance(weather.weather[0].id),
        bestTime: bestActivityTime(weather),
      };
    });

    const failed = cityData.find((c) => c.error);
    if (failed) return res.status(404).json({ error: failed.error });

    // AI summary
    let summary = null;
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const groq = new Groq({ apiKey: groqKey });
        const completion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: buildComparePrompt(cityData, unit || "metric") }],
          temperature: 0.6,
        });
        summary = completion.choices[0].message.content.trim();
      } catch {
        // AI summary is optional — don't fail the whole request
      }
    }

    return res.json({ cities: cityData, summary });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to compare cities" });
  }
};
