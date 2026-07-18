# 🍺 Zytholo
*Formerly known as BeerTracker*

A web app to track beer consumption with multi-user management, configurable alerts, and a rich statistics dashboard.

<img width="1536" height="1024" alt="readme" src="https://github.com/user-attachments/assets/813bb644-86c2-4f2b-8df4-5274ecb5710c" />

## Features

### For users
- **Consumption logging**: Track pints (50cl), half-pints (25cl), and 33cl beers with date and time.
- **Logical “day” view**: Browse a day history (from 07:00 to 06:59), which fits late-night sessions better than calendar days.
- **Night mode**: Activate a dedicated evening mode directly from the dashboard.
- **Personal analytics**:
  - Total liters consumed
  - Breakdown by format (pints, half-pints, 33cl)
  - Estimated cost based on a configurable average beer price
  - Best evening over the selected period, with an optional name for the all-time record evening (forgotten automatically when a new evening beats the record)
  - Monthly chart and rolling 4-week chart
  - Full consumption timeline
- **Configurable alerts**:
  - Warning when consumption exceeds a personal threshold over a rolling 3-hour window
  - Warning when the number of drinking days in a week reaches a configurable threshold
  - Water reminder inviting you to drink a glass of water once the evening's consumption passes a threshold (default 1 L); dismiss it with the check button and it reappears after another full threshold is consumed
  - Any alert threshold can be set to `0` to disable that alert
- **Blood alcohol estimation**:
  - Estimated blood alcohol content (BAC) for the current evening using the Widmark formula with gradual (~30 min) absorption, based on your weight, sex, and average beer strength (set in the settings)
  - Live estimate that rises while a beer is being absorbed and falls afterwards, with a clear **can I drive?** verdict against a configurable legal limit (default 0.5 g/L; adjust it per country), plus the estimated time you drop back under it and reach 0
  - Interactive graph of the estimated BAC across the whole evening (until it returns to 0), with the legal-limit line and a live "now" marker; it updates whenever a beer is added or removed
  - Always indicative only: it does not replace a breathalyser, and a probationary/novice licence allows 0 g/L — see [How the blood alcohol estimate works](#how-the-blood-alcohol-estimate-works)
- **Rankings**:
  - Weekly podium to compare your consumption with other users
  - Monthly podium to see where you stand against the rest of the app
  - Yearly podium for long-term comparison with other users
  - Additional ranking tables showing the other users and their totals
- **Customization**:
  - French and English interface
  - Light, dark, or automatic theme
  - Personal settings saved in the app
- **Exports**:
  - Export personal history as CSV
  - Export the dashboard as PNG
- **Security**:
  - Password change from the user menu
  - Forced password change support for temporary passwords

### For administrators
- **User management**:
  - Create and delete accounts
  - Reset user passwords
  - Force password change on next login
  - Enable or disable night mode for each user
- **Global ranking**: View the yearly comparison table for all non-admin users with totals by format and liters.
- **CSV import/export**: Export all data or import bulk history from CSV files.
- **Automatic user provisioning**: Missing users are created automatically during import with a temporary password.

## How the blood alcohol estimate works

The dashboard shows an estimated blood alcohol content (BAC, in g/L) for the current evening. It requires your **weight** and **sex** in the settings (leave the weight empty or set it to `0` to disable the estimate).

### The formula

Each logged beer contributes a mass of pure alcohol:

```
alcohol (g) = volume (L) × strength (% ABV) × 7.89
```

(7.89 g is the mass of pure ethanol in one liter of beer per degree of alcohol.)

That mass is converted into a peak BAC contribution with the **Widmark formula**:

```
peak (g/L) = alcohol (g) / (weight (kg) × r)
```

where `r` is the body-water distribution ratio: **0.68 for men**, **0.55 for women**.

Two refinements make the estimate more realistic than a raw Widmark snapshot:

- **Gradual absorption** — a beer is not downed in one gulp, so each drink's contribution rises **linearly from 0 to its peak over ~30 minutes** (the average time to drink one) instead of jumping instantly.
- **Elimination** — the body clears alcohol at a constant **0.15 g/L per hour**, applied continuously from the first drink of the evening.

So at any instant `t`, the estimated BAC is:

```
BAC(t) = max(0, Σ peakᵢ × absorbedᵢ(t) − 0.15 × (hours since the first drink))
```

where `absorbedᵢ(t)` ramps from 0 to 1 over the 30 minutes following drink `i`.

The **can-I-drive?** verdict compares this value to the configurable legal limit (default **0.5 g/L**; e.g. 0.8 in the UK/USA, 0.0 for a probationary licence). The times to drop back under the limit and to reach 0 are projected from the fully-absorbed peak, so they stay correct even while a beer is still being absorbed.

### The graph

Below the current value, a chart plots the modeled BAC curve for the whole evening — **from the first drink until the level returns to 0**. Because the model is linear between events, the curve is drawn as straight, piecewise-linear segments. It shows:

- the **estimated BAC** curve — rising during absorption, falling during elimination; it can show several bumps when drinks are spaced out (the level dips between an absorbed drink and the next one);
- a dashed **legal-limit** line;
- a **"now"** marker sitting exactly on the curve at the current time.

The curve is recomputed every time a beer is added or removed during the evening, and the live value and the marker follow it in real time.

> ⚠️ The estimate is **indicative only**. It relies on standard averages and cannot know food intake, drinking pace, individual metabolism, medication, etc. It does not replace a breathalyser and must never be used to decide whether to drive. When in doubt, don't drive.

## Deployment (via Docker)

```bash
git clone https://github.com/pstraebler/zytholo.git
cd zytholo
cp .env.example .env
```

**⚠️ Important**: Update the following values in `.env`:

- `SECRET_KEY`: Secret key for Flask sessions (generate a long random string):

    ```bash
    python -c 'import secrets; print(secrets.token_hex(32))'
    # OR
    openssl rand -hex 32
    ```

- `APP_PORT`: Port the app will listen on and expose locally (default: `8080`)
- `ADMIN_USERNAME`: Optional. Admin username (default: `admin`)
- `ADMIN_PASSWORD`: Admin password
- `USE_HTTPS`: Do not enable in local environments (default: `0`)
- `DB_HOST`: MariaDB host (Docker default: `mariadb`)
- `DB_PORT`: MariaDB port (default: `3306`)
- `DB_NAME`: Database name
- `DB_USER`: Application DB user
- `DB_PASSWORD`: Application DB password
- `DB_ROOT_PASSWORD`: MariaDB root password (used by Docker service)

Then :

```bash
docker-compose up -d --build
```

### Production web server

The container runs on **[Gunicorn](https://gunicorn.org/)**, a production-grade WSGI server — **not** Flask's built-in development server, which is single-process and unsuitable for production.

- The startup command is defined in the image (`Dockerfile`): `gunicorn -c gunicorn.conf.py app:app`.
- Tuning lives in [`gunicorn.conf.py`](gunicorn.conf.py) and every value can be overridden with an environment variable (no image rebuild needed — just set it in `.env`).
- Gunicorn binds to `0.0.0.0:$APP_PORT` inside the container. The app is meant to sit **behind a reverse proxy / tunnel** (e.g. a Cloudflare tunnel) that terminates TLS; `ProxyFix` is already configured so the real client IP and scheme are honored.

Optional tuning variables:

| Variable | Default | Description |
| --- | --- | --- |
| `GUNICORN_WORKERS` | `3` | Number of worker processes. Rule of thumb: `(2 × CPU cores) + 1`. |
| `GUNICORN_THREADS` | `2` | Threads per worker. |
| `GUNICORN_TIMEOUT` | `60` | Seconds before a stalled request is killed. |
| `GUNICORN_GRACEFUL_TIMEOUT` | `30` | Seconds allowed for workers to finish on restart. |
| `GUNICORN_MAX_REQUESTS` | `1000` | Recycle a worker after this many requests (mitigates memory leaks). |
| `GUNICORN_MAX_REQUESTS_JITTER` | `100` | Random spread added to `MAX_REQUESTS` so workers don't all recycle at once. |
| `GUNICORN_LOGLEVEL` | `info` | Log verbosity. |
| `GUNICORN_FORWARDED_ALLOW_IPS` | `*` | Proxy IPs trusted for `X-Forwarded-*` headers. |

Access and error logs are written to stdout/stderr, so they are available through `docker logs zytholo-app`.

> For local development only, you can still run Flask's built-in server with `python app.py` — do not use it in production.

### First startup

The app is available at **http://localhost:8080** by default, or at **http://localhost:$APP_PORT** if you changed the port.

1. Log in with the configured admin credentials.
2. Create users from the admin panel.
3. Users can log in with their own credentials.

## Data storage

MariaDB data is stored in the Docker volume `mariadb_data`.

## CSV import format

### For administrator (full import)

```csv
User,Date,Time,Pints,HalfPints,33cl
baptiste,2026-01-15,20:30:00,2,1,0
guy,2026-01-15,21:00:00,0,2,1
```

- **User**: Username (created automatically if it does not exist)
- **Date**: `YYYY-MM-DD` format
- **Time**: `HH:MM:SS` format (optional, default `00:00:00`)
- **Pints**: Number of pints (50cl)
- **HalfPints**: Number of half-pints (25cl)
- **33cl**: Number of 33cl bottles/cans
