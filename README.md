# WeatherNow — Server

Express/serverless backend for WeatherNow. Proxies requests to the OpenWeatherMap API so the API key is never exposed to the client.

## Endpoints

### `GET /weather`

Returns current weather data for a given city.

**Query Parameters**

| Param   | Required | Description                      |
| ------- | -------- | -------------------------------- |
| `city`  | Yes      | City name (e.g. `London`)        |
| `units` | No       | `metric` (default) or `imperial` |

**Example**

```
GET /weather?city=Tokyo&units=metric
```

**Success Response** — OpenWeatherMap current weather object (200)

**Error Responses**

| Status | Reason                          |
| ------ | ------------------------------- |
| 400    | Missing or empty `city` param   |
| 404    | City not found                  |
| 500    | Server error or missing API key |

## Tech Stack

- Node.js
- Express (local dev)
- Axios
- dotenv
- Vercel serverless functions (production)

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenWeatherMap API key](https://openweathermap.org/api) (free tier works)

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
```

> Never commit `.env` — it is already in `.gitignore`.

## Project Structure

```
weather-server/
├── api/
│   └── weather.js   # Vercel serverless function (production)
├── index.js         # Express server (local dev only)
├── vercel.json      # Vercel routing — maps /weather → api/weather.js
├── package.json
├── .env             # API key (not committed)
└── .gitignore
```

## Deployment (Vercel)

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add `WEATHER_API_KEY` as an environment variable in the Vercel project settings
4. Deploy

Vercel uses `api/weather.js` via the routing in `vercel.json`. The `index.js` Express file is for local development only.

## Adding a `start` Script (optional)

The `package.json` doesn't include a start script by default. Add one for convenience:

```json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js"
}
```
