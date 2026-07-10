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
  - Best evening over the selected period
  - Monthly chart and rolling 4-week chart
  - Full consumption timeline
- **Configurable alerts**:
  - Warning when consumption exceeds a personal threshold over a rolling 3-hour window
  - Warning when the number of drinking days in a week reaches a configurable threshold
  - Water reminder inviting you to drink a glass of water once the evening's consumption passes a threshold (default 1 L); dismiss it with the check button and it reappears after another full threshold is consumed
  - Any alert threshold can be set to `0` to disable that alert
- **Blood alcohol estimation**:
  - Estimated blood alcohol content (BAC) for the current evening using the Widmark formula, based on your weight, sex, and average beer strength (set in the settings)
  - Live decreasing estimate with a clear **can I drive?** verdict against the 0.5 g/L legal limit, plus the estimated time you drop back under it
  - Always indicative only: it does not replace a breathalyser, and a probationary/novice licence allows 0 g/L
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
