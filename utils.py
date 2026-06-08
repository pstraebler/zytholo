from models import Database
from auth import hash_password
from datetime import datetime, timedelta, date, time as dt_time
import csv
import io
import secrets

EVENING_ROLLOVER_HOUR = 6


def get_evening_reference(record, rollover_hour=EVENING_ROLLOVER_HOUR):
    """Rattacher un enregistrement à une soirée pouvant déborder après minuit."""
    record_date = datetime.strptime(record['date'], '%Y-%m-%d').date()
    record_time = datetime.strptime(record['time'], '%H:%M:%S').time()

    evening_date = record_date
    if record_time.hour < rollover_hour:
        evening_date -= timedelta(days=1)

    chronological_datetime = datetime.combine(record_date, record_time)
    return evening_date, chronological_datetime


def calculate_record_evening(records):
    """Calculer la soirée la plus consommée sur les enregistrements fournis."""
    if not records:
        return None

    evenings = {}

    for record in records:
        evening_date, chronological_datetime = get_evening_reference(record)
        evening_key = evening_date.isoformat()
        pints = record['pints'] or 0
        half_pints = record['half_pints'] or 0
        liters_33 = record['liters_33'] or 0
        liters = (pints * 0.5) + (half_pints * 0.25) + (liters_33 * 0.33)

        if evening_key not in evenings:
            evenings[evening_key] = {
                'date': evening_key,
                'total_pints': 0,
                'total_half_pints': 0,
                'total_33cl': 0,
                'total_liters': 0,
                'entry_count': 0,
                'first_time': record['time'],
                'last_time': record['time'],
                'first_datetime': chronological_datetime,
                'last_datetime': chronological_datetime
            }

        evening = evenings[evening_key]
        evening['total_pints'] += pints
        evening['total_half_pints'] += half_pints
        evening['total_33cl'] += liters_33
        evening['total_liters'] += liters
        evening['entry_count'] += 1

        if chronological_datetime < evening['first_datetime']:
            evening['first_datetime'] = chronological_datetime
            evening['first_time'] = record['time']

        if chronological_datetime > evening['last_datetime']:
            evening['last_datetime'] = chronological_datetime
            evening['last_time'] = record['time']

    best_evening = max(
        evenings.values(),
        key=lambda evening: (evening['total_liters'], evening['date'])
    )

    best_evening.pop('first_datetime', None)
    best_evening.pop('last_datetime', None)
    best_evening['total_liters'] = round(best_evening['total_liters'], 2)
    return best_evening

def calculate_stats(
    user_id,
    start_date=None,
    end_date=None,
    three_hour_threshold_liters=1.5,
    weekly_drinking_days_threshold=3
):
    """Calculer les statistiques de consommation avec détection de fenêtres de 3h"""
    records = Database.get_consumption(user_id, start_date, end_date)
    
    total_pints = 0
    total_half_pints = 0
    total_33cl = 0
    total_liters = 0
    three_hour_warnings = []
    today_str = date.today().isoformat()
    monthly_stats = {}
    
    for record in records:
        pints = record['pints'] or 0
        half_pints = record['half_pints'] or 0
        liters_33 = record['liters_33'] or 0
        
        total_pints += pints
        total_half_pints += half_pints
        total_33cl += liters_33
        
        daily_liters = (pints * 0.5) + (half_pints * 0.25) + (liters_33 * 0.33)
        total_liters += daily_liters
        
        month_key = record['date'][:7]
        if month_key not in monthly_stats:
            monthly_stats[month_key] = {'pints': 0, 'half_pints': 0, '33cl': 0}
        monthly_stats[month_key]['pints'] += pints
        monthly_stats[month_key]['half_pints'] += half_pints
        monthly_stats[month_key]['33cl'] += liters_33
    
    if records:
        today_records = [r for r in records if r['date'] == today_str]
        
        if today_records:
            processed_times = set()
            
            for record in sorted(today_records, key=lambda r: r['time']):
                record_time_str = record['time']
                
                # Sauter si on a déjà traité cette heure
                if record_time_str in processed_times:
                    continue
                
                record_time = datetime.strptime(record_time_str, '%H:%M:%S').time()
                record_datetime = datetime.combine(
                    datetime.strptime(record['date'], '%Y-%m-%d').date(), 
                    record_time
                )
                
                # Fenêtre: de record_time à record_time + 3 heures
                window_end = record_datetime + timedelta(hours=3)
                
                # Chercher tous les enregistrements dans cette fenêtre
                window_liters = 0
                window_items = []
                window_times = []
                
                for other_record in today_records:
                    other_time_str = other_record['time']
                    other_time = datetime.strptime(other_time_str, '%H:%M:%S').time()
                    other_datetime = datetime.combine(
                        datetime.strptime(other_record['date'], '%Y-%m-%d').date(), 
                        other_time
                    )
                    
                    # Si l'enregistrement est dans la fenêtre de 3h
                    if record_datetime <= other_datetime <= window_end:
                        other_pints = other_record['pints'] or 0
                        other_half = other_record['half_pints'] or 0
                        other_33 = other_record['liters_33'] or 0
                        
                        other_liters = (other_pints * 0.5) + (other_half * 0.25) + (other_33 * 0.33)
                        window_liters += other_liters
                        window_items.append({
                            'time': other_time_str,
                            'liters': round(other_liters, 2)
                        })
                        window_times.append(other_time_str)
                
                # Créer l'avertissement seulement si dépassement ET première fois
                if window_liters >= three_hour_threshold_liters:
                    three_hour_warnings.append({
                        'start_time': record_time_str,
                        'end_time': window_end.strftime('%H:%M:%S'),
                        'total_liters': round(window_liters, 2),
                        'threshold_liters': round(three_hour_threshold_liters, 2),
                        'start_date': record['date'],
                        'end_date': window_end.strftime('%Y-%m-%d'),
                        'items': window_items
                    })
                    
                    # Marquer tous les enregistrements de cette fenêtre comme traités
                    for time_str in window_times:
                        processed_times.add(time_str)
    
    # Vérifier si c'est le 3ème jour de la semaine
    is_weekly_threshold_reached, drinking_days = check_weekly_drinking_days(
        user_id,
        today_str,
        weekly_drinking_days_threshold
    )
    
    if is_weekly_threshold_reached:
        day_indexes = []
        for day_str in sorted(drinking_days):
            if isinstance(day_str, date):
                day_obj = datetime.combine(day_str, dt_time.min)
            else:
                day_obj = datetime.strptime(day_str, '%Y-%m-%d')
            day_indexes.append(day_obj.weekday())
        
        # Nombre de jours de consommation
        num_days = len(drinking_days)
        
        three_hour_warnings.append({
            'start_time': '00:00:00',
            'end_time': '23:59:59',
            'total_liters': 0,
            'start_date': today_str,
            'end_date': today_str,
            'items': [],
            'type': 'weekly',
            'num_days': num_days,
            'threshold_days': weekly_drinking_days_threshold,
            'day_indexes': day_indexes
        })
    
    return {
        'total_pints': total_pints,
        'total_half_pints': total_half_pints,
        'total_33cl': total_33cl,
        'total_liters': round(total_liters, 2),
        'warnings': three_hour_warnings,
        'monthly_stats': monthly_stats,
        'all_records': records,
        'best_evening': calculate_record_evening(records)
    }

def export_csv(user_id=None, all_users=False):
    """Exporter les données en CSV"""
    output = io.StringIO()
    writer = csv.writer(output)
    
    if all_users:
        writer.writerow(['Utilisateur', 'Date', 'Heure', 'Pintes', 'Demis', '33cl'])
        users = Database.get_all_users()
        for user in users:
            records = Database.get_consumption(user['id'])
            for record in records:
                writer.writerow([
                    user['username'],
                    record['date'],
                    record['time'] if 'time' in record.keys() else '00:00:00',
                    record['pints'] or 0,
                    record['half_pints'] or 0,
                    record['liters_33'] or 0
                ])
    else:
        writer.writerow(['Date', 'Heure', 'Pintes', 'Demis', '33cl'])
        records = Database.get_consumption(user_id)
        for record in records:
            writer.writerow([
                record['date'],
                record['time'] if 'time' in record.keys() else '00:00:00',
                record['pints'] or 0,
                record['half_pints'] or 0,
                record['liters_33'] or 0
            ])
    
    return output.getvalue()

def import_csv(file_content, user_id=None, all_users=False):
    """Importer des données depuis un CSV"""
    decoded = file_content.decode('utf-8')
    reader = csv.reader(io.StringIO(decoded))
    
    header = next(reader, None)

    imported_count = 0
    errors = []
    created_users = []

    for row in reader:
        try:
            username = row[0].strip()
            date = row[1].strip()
            time_value = row[2].strip() if len(row) > 2 else "00:00:00"
            pints = int(row[3]) if len(row) > 3 else 0
            half_pints = int(row[4]) if len(row) > 4 else 0
            liters_33 = int(row[5]) if len(row) > 5 else 0

            # Vérifier si utilisateur existe
            if not Database.user_exists(username):
                # Création automatique
                temp_password = secrets.token_urlsafe(12)
                password_hash = hash_password(temp_password)
                success, message = Database.create_user(username, password_hash, force_password_change=True)

                if success:
                    created_users.append({
                        "username": username,
                        "password": temp_password
                    })
                else:
                    errors.append(f"Erreur création utilisateur {username}")
                    continue

            user_uuid = Database.get_user_id(username)

            Database.add_consumption(
                user_uuid,
                date,
                pints,
                half_pints,
                liters_33,
                time_value
            )

            imported_count += 1

        except Exception as e:
            errors.append(f"Ligne invalide {row}: {str(e)}")

    return imported_count, errors, created_users

def get_top_drinkers(year=None):
    """Obtenir le classement des plus gros buveurs"""
    if year is None:
        year = date.today().year

    start = f"{year}-01-01"
    end = f"{year}-12-31"

    conn = Database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            users.username,
            SUM(consumption.pints) AS total_pints,
            SUM(consumption.half_pints) AS total_half_pints,
            SUM(consumption.liters_33) AS total_33cl,
            COALESCE(ROUND(
                SUM(consumption.pints) * 0.5 +
                SUM(consumption.half_pints) * 0.25 +
                SUM(consumption.liters_33) * 0.33, 2
            ), 0) AS total_liters
        FROM users
        LEFT JOIN consumption
            ON users.id = consumption.user_id
            AND consumption.date >= %s
            AND consumption.date <= %s
        WHERE users.is_admin = 0
        GROUP BY users.id, users.username
        ORDER BY total_liters DESC
    """, (start, end))
    drinkers = cursor.fetchall()
    conn.close()
    return drinkers

def get_top_drinkers_for_month(year=None, month=None):
    """Obtenir le classement des plus gros buveurs pour un mois donné"""
    today = date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month

    start = f"{year}-{month:02d}-01"
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    end = (next_month - timedelta(days=1)).isoformat()

    conn = Database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            users.username,
            SUM(consumption.pints) AS total_pints,
            SUM(consumption.half_pints) AS total_half_pints,
            SUM(consumption.liters_33) AS total_33cl,
            COALESCE(ROUND(
                SUM(consumption.pints) * 0.5 +
                SUM(consumption.half_pints) * 0.25 +
                SUM(consumption.liters_33) * 0.33, 2
            ), 0) AS total_liters
        FROM users
        LEFT JOIN consumption
            ON users.id = consumption.user_id
            AND consumption.date >= %s
            AND consumption.date <= %s
        WHERE users.is_admin = 0
        GROUP BY users.id, users.username
        ORDER BY total_liters DESC
    """, (start, end))
    drinkers = cursor.fetchall()
    conn.close()
    return drinkers

def get_top_drinkers_for_week(reference_date=None):
    """Obtenir le classement des plus gros buveurs pour la semaine lundi-dimanche."""
    if reference_date is None:
        reference_date = date.today()
    elif isinstance(reference_date, str):
        reference_date = datetime.strptime(reference_date, '%Y-%m-%d').date()

    start_date = reference_date - timedelta(days=reference_date.weekday())
    end_date = start_date + timedelta(days=6)

    conn = Database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            users.username,
            SUM(consumption.pints) AS total_pints,
            SUM(consumption.half_pints) AS total_half_pints,
            SUM(consumption.liters_33) AS total_33cl,
            COALESCE(ROUND(
                SUM(consumption.pints) * 0.5 +
                SUM(consumption.half_pints) * 0.25 +
                SUM(consumption.liters_33) * 0.33, 2
            ), 0) AS total_liters
        FROM users
        LEFT JOIN consumption
            ON users.id = consumption.user_id
            AND consumption.date >= %s
            AND consumption.date <= %s
        WHERE users.is_admin = 0
        GROUP BY users.id, users.username
        ORDER BY total_liters DESC
    """, (start_date.isoformat(), end_date.isoformat()))
    drinkers = cursor.fetchall()
    conn.close()
    return drinkers

def check_weekly_drinking_days(user_id, current_date, weekly_drinking_days_threshold=3):
    """
    Vérifie si le seuil de jours de consommation de la semaine est atteint.
    Retourne (is_threshold_reached, drinking_days)
    """
    from datetime import datetime, timedelta
    from models import Database
    
    if isinstance(current_date, str):
        current_date_obj = datetime.strptime(current_date, '%Y-%m-%d').date()
    else:
        current_date_obj = current_date
    
    # Trouver le lundi de la semaine courante
    days_since_monday = current_date_obj.weekday()  # 0 = lundi, 6 = dimanche
    week_start = current_date_obj - timedelta(days=days_since_monday)
    week_end = week_start + timedelta(days=6)
    
    # Récupérer les jours dont la consommation nette est positive.
    # Un retrait crée une ligne négative horodatée, donc l'existence d'une
    # ligne ne suffit pas pour considérer que le jour compte comme consommé.
    conn = Database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DATE_FORMAT(date, '%%Y-%%m-%%d') AS date
        FROM consumption 
        WHERE user_id = %s 
        AND date >= %s 
        AND date <= %s
        GROUP BY consumption.date
        HAVING (
            COALESCE(SUM(pints), 0) * 0.5
            + COALESCE(SUM(half_pints), 0) * 0.25
            + COALESCE(SUM(liters_33), 0) * 0.33
        ) > 0
        ORDER BY consumption.date
    """, (user_id, week_start.isoformat(), week_end.isoformat()))
    
    drinking_days = [row['date'] for row in cursor.fetchall()]
    conn.close()
    
    return len(drinking_days) >= weekly_drinking_days_threshold, drinking_days

def calculate_weekly_stats(user_id):
    """Calculer les stats des 4 dernières semaines en litres (incluant la semaine en cours)"""
    from datetime import datetime, timedelta
    from models import Database
    
    today = datetime.now().date()
    
    # Trouver le lundi de la semaine courante
    days_since_monday = today.weekday()
    current_week_start = today - timedelta(days=days_since_monday)
    
    # Calculer les 4 semaines (incluant la courante)
    weeks = []
    for i in range(3, -1, -1):  # 3, 2, 1, 0
        week_start = current_week_start - timedelta(weeks=i)
        week_end = week_start + timedelta(days=6)
        weeks.append({
            'start': week_start,
            'end': week_end
        })
    
    # Récupérer les données pour chaque semaine
    weekly_data = []
    for week in weeks:
        records = Database.get_consumption(
            user_id, 
            week['start'].isoformat(), 
            week['end'].isoformat()
        )
        
        total_liters = 0
        
        for record in records:
            pints = record['pints'] or 0
            half_pints = record['half_pints'] or 0
            liters_33 = record['liters_33'] or 0
            
            # Convertir en litres : pinte=0.5L, demi=0.25L, 33cl=0.33L
            total_liters += (pints * 0.5) + (half_pints * 0.25) + (liters_33 * 0.33)
        
        weekly_data.append({
            'week_start': week['start'].isoformat(),
            'week_end': week['end'].isoformat(),
            'total_liters': round(total_liters, 2)
        })
    
    return weekly_data
