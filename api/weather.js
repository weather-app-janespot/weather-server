const axios = require("axios");

/**
 * Vercel serverless function — GET /weather
 *
 * Proxies requests to the OpenWeatherMap current weather API.
 * Keeping the API key server-side prevents it from being exposed in the browser.
 *
 * Query params:
 *   city  (required) — city name, e.g. "London"
 *   units (optional) — "metric" (default) or "imperial"
 */
module.exports = async (req, res) => {
    // Allow requests from any origin (required for the React frontend to call this endpoint)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle CORS preflight requests sent by the browser before the actual GET
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const { city, units } = req.query;

    // Validate that a non-empty city was provided
    if (!city || !city.trim()) {
        return res.status(400).json({ error: "City parameter is required" });
    }

    const apiKey = process.env.WEATHER_API_KEY;

    // Guard against missing environment variable — fail fast with a clear message
    if (!apiKey) {
        return res.status(500).json({ error: "API key not configured" });
    }

    // Default to metric; only switch to imperial if explicitly requested
    const unitParam = units === "imperial" ? "imperial" : "metric";

    try {
        const response = await axios.get(
            // encodeURIComponent handles city names with spaces or special characters
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${unitParam}&appid=${apiKey}`
        );
        // Forward the OpenWeatherMap response directly to the client
        res.json(response.data);
    } catch (error) {
        // Propagate the upstream HTTP status (e.g. 404 for unknown city) when available,
        // otherwise fall back to 500
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || "Failed to fetch weather data";
        res.status(status).json({ error: message });
    }
};
