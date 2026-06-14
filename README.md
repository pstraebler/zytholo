# 🍺 Zytholo
*Formerly known as BeerTracker*

A web app to track beer consumption with multi-user management, configurable alerts, and a rich statistics dashboard.

<img width="2560" height="1664" alt="beertracker" src="https://github.com/user-attachments/assets/fbefe3bd-58ac-49df-90dc-58cdf3db4856" />

## Features

### For users
- **Consumption logging**: Track pints (50cl), half-pints (25cl), and 33cl beers with date and time.
- **Logical “day” view**: Browse a day history from 07:00 to 06:59, which fits late-night sessions better than calendar days.
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
- **Rankings**:
  - Weekly podium
  - Monthly podium
  - Yearly podium
  - Additional ranking tables for the other users
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
- **Global ranking**: View the yearly ranking table for all non-admin users with totals by format and liters.
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

- `APP_PORT`: Port the app will listen on
- `HOST_PORT`: Port exposed by Docker (Docker only)
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

### First startup

The app is available at **http://localhost:8080**

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
