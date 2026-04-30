# WeatherNow — Server

Express/serverless backend for WeatherNow. Proxies requests to the OpenWeatherMap API and provides an AI endpoint powered by Groq, so API keys are never exposed to the client.

## Endpoints

### `GET /weather`

Returns current weather data for a given city.

| Param   | Required | Description                      |
| ------- | -------- | -------------------------------- |
| `city`  | Yes      | City name (e.g. `London`)        |
| `units` | No       | `metric` (default) or `imperial` |

**Example:** `GET /weather?city=Tokyo&units=metric`

**Error Responses**

| Status | Reason                          |
| ------ | ------------------------------- |
| 400    | Missing or empty `city` param   |
| 404    | City not found                  |
| 500    | Server error or missing API key |

---

### `GET /cities`

Returns city autocomplete suggestions.

| Param   | Required | Description                     |
| ------- | -------- | ------------------------------- |
| `q`     | Yes      | Search string, min 2 chars      |
| `limit` | No       | Max results (default 8, max 20) |

**Example:** `GET /cities?q=lon&limit=8`

---

### `POST /ai`

Generates a natural language weather summary and activity recommendations, or answers a user question about the weather.

**Request body:**

```json
{
  "weather": {},
  "unit": "metric",
  "question": "Can I go for a run?"
}
```

- `weather` (required) — OpenWeatherMap weather object
- `unit` (optional) — `"metric"` or `"imperial"`, defaults to `"metric"`
- `question` (optional) — if omitted, returns structured summary JSON; if provided, returns a conversational answer

**Response without question:**

```json
{
  "summary": "...",
  "recommendation": "...",
  "bestTime": "..."
}
```

**Response with question:**

```json
{
  "answer": "..."
}
```

---

## Tech Stack

- Node.js + Express (local dev)
- Vercel serverless functions (production)
- Axios
- dotenv
- [Groq SDK](https://console.groq.com) — LLM inference (llama-3.3-70b-versatile)

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenWeatherMap API key](https://openweathermap.org/api) (free tier)
- A [Groq API key](https://console.groq.com) (free tier)

### Install & Run

```bash
npm install
node index.js
```

Server runs at `http://localhost:5000`.

### Environment Variables

Create a `.env` file in this directory:

```
WEATHER_API_KEY=your_openweathermap_api_key
GROQ_API_KEY=your_groq_api_key
```

> Never commit `.env` — it is already in `.gitignore`.

## Project Structure

```
weather-server/
├── api/
│   ├── weather.js   # Vercel serverless — proxies OWM /weather
│   ├── cities.js    # Vercel serverless — city autocomplete
│   └── ai.js        # Vercel serverless — Groq AI insights
├── index.js         # Express dev server (mirrors api/ routes)
├── city.list.json   # OWM city dataset for autocomplete
├── vercel.json      # Route mappings for Vercel deployment
├── package.json
├── .env             # API keys (not committed)
└── .gitignore
```

## Deployment (Vercel)

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com) — set Framework Preset to **Other**
3. Add environment variables in Vercel project settings:
   - `WEATHER_API_KEY`
   - `GROQ_API_KEY`
4. Deploy

Vercel routes requests via `vercel.json` to the serverless functions in `api/`. The `index.js` Express file is for local development only.
