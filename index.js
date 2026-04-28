const express = require('express');
const axios = require("axios");
const cors = require("cors");
require("dotenv").config(); // Load WEATHER_API_KEY from .env into process.env

const app = express();

// Allow cross-origin requests from the React dev server (localhost:5173)
app.use(cors());

const PORT = process.env.PORT || 5000;

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
    const { city } = req.query;
    const apiKey = process.env.WEATHER_API_KEY;

    try {
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`
        );
        res.json(response.data);
    } catch (error) {
        console.log(error);
        // Return a 500 with an empty body — consider adding an error message for easier debugging
        res.status(500).json();
    }
});

app.listen(PORT, () => console.log(`Listening to port ${PORT}`));
