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
                'last_datetime': chronological_datetime,
                'entries': []
            }

        evening = evenings[evening_key]
        evening['total_pints'] += pints
        evening['total_half_pints'] += half_pints
        evening['total_33cl'] += liters_33
        evening['total_liters'] += liters
        evening['entry_count'] += 1
        evening['entries'].append({
            'time': record['time'],
            'pints': pints,
            'half_pints': half_pints,
            'liters_33': liters_33,
            'liters': round(liters, 2),
            'chronological_datetime': chronological_datetime.isoformat()
        })

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

    best_evening['entries'].sort(key=lambda entry: entry['chronological_datetime'])
    for entry in best_evening['entries']:
        entry.pop('chronological_datetime', None)

    best_evening.pop('first_datetime', None)
    best_evening.pop('last_datetime', None)
    best_evening['total_liters'] = round(best_evening['total_liters'], 2)
    return best_evening


def get_current_evening_total(user_id, reference_datetime=None, rollover_hour=EVENING_ROLLOVER_HOUR):
    """Total de litres consommés pendant la soirée en cours (déborde après minuit)."""
    records = Database.get_consumption(user_id)
    if not records:
        return 0.0

    now = reference_datetime or datetime.now()
    current_evening_date = now.date()
    if now.hour < rollover_hour:
        current_evening_date -= timedelta(days=1)
    current_key = current_evening_date.isoformat()

    total = 0.0
    for record in records:
        evening_date, _ = get_evening_reference(record, rollover_hour)
        if evening_date.isoformat() != current_key:
            continue
        pints = record['pints'] or 0
        half_pints = record['half_pints'] or 0
        liters_33 = record['liters_33'] or 0
        total += (pints * 0.5) + (half_pints * 0.25) + (liters_33 * 0.33)

    return round(total, 2)


def get_current_evening_last_datetime(user_id, reference_datetime=None, rollover_hour=EVENING_ROLLOVER_HOUR):
    """Horodatage (heure locale) de la derniere consommation de la soiree en cours, ou None."""
    records = Database.get_consumption(user_id)
    if not records:
        return None

    now = reference_datetime or datetime.now()
    current_evening_date = now.date()
    if now.hour < rollover_hour:
        current_evening_date -= timedelta(days=1)
    current_key = current_evening_date.isoformat()

    last_datetime = None
    for record in records:
        evening_date, chronological_datetime = get_evening_reference(record, rollover_hour)
        if evening_date.isoformat() != current_key:
            continue
        if last_datetime is None or chronological_datetime > last_datetime:
            last_datetime = chronological_datetime

    return last_datetime


# --- Estimation de l'alcoolemie (formule de Widmark) ---
# Valeurs standard. L'estimation reste indicative : elle ne remplace pas un
# ethylotest et ne prejuge pas de l'aptitude reelle a conduire.
ETHANOL_G_PER_LITER_PER_DEGREE = 7.89  # g d'alcool pur par litre de biere et par degre (%)
WIDMARK_R_MALE = 0.68
WIDMARK_R_FEMALE = 0.55
ELIMINATION_RATE_PER_HOUR = 0.15  # g/L eliminee par heure
LEGAL_BAC_LIMIT = 0.5  # g/L (seuil general France ; 0 en permis probatoire)
# Une biere ne se boit pas d'un trait : on modelise une absorption progressive.
# Chaque prise fait monter l'alcoolemie lineairement de 0 a son pic sur cette duree,
# au lieu d'un saut instantane. L'elimination s'applique en parallele.
ABSORPTION_MINUTES = 30.0
ABSORPTION_HOURS = ABSORPTION_MINUTES / 60.0


def _absorbed_fraction(now, drink_datetime):
    """Fraction (0 a 1) du pic d'une prise deja absorbee a l'instant 'now'.

    Montee lineaire sur ABSORPTION_HOURS depuis l'heure de la prise, puis plateau a 1.
    """
    if ABSORPTION_HOURS <= 0:
        return 1.0 if now >= drink_datetime else 0.0
    elapsed_hours = (now - drink_datetime).total_seconds() / 3600.0
    return min(1.0, max(0.0, elapsed_hours / ABSORPTION_HOURS))


def _net_evening_drinks(drinks):
    """Deduire les retraits (litres negatifs) des prises positives d'une soiree.

    Un retrait de biere est enregistre comme une ligne a litres negatifs (voir
    add_consumption / changeBeer cote client). Il corrige une prise loggee par erreur :
    on annule donc l'equivalent de prises positives, les plus recentes d'abord (comme
    un « annuler »), pour que la courbe se recalcule comme si la biere n'avait jamais
    ete ajoutee. Sans cela, la ligne negative serait ignoree et le taux resterait
    inchange apres un retrait.

    'drinks' : liste de (datetime, litres). Retourne les prises positives restantes
    (datetime, litres), triees chronologiquement.
    """
    positives = sorted(([dt, liters] for dt, liters in drinks if liters > 0),
                       key=lambda item: item[0])
    to_remove = sum(-liters for _dt, liters in drinks if liters < 0)  # >= 0
    index = len(positives) - 1
    while to_remove > 1e-9 and index >= 0:
        take = min(positives[index][1], to_remove)
        positives[index][1] -= take
        to_remove -= take
        index -= 1
    return [(dt, liters) for dt, liters in positives if liters > 1e-9]


def estimate_current_bac(
    user_id,
    weight_kg,
    sex,
    beer_abv=5.0,
    legal_limit=LEGAL_BAC_LIMIT,
    reference_datetime=None,
    tz_offset_minutes=None,
    rollover_hour=EVENING_ROLLOVER_HOUR,
):
    """Estimer l'alcoolemie actuelle pour la soiree en cours (formule de Widmark).

    Les consommations sont horodatees a l'heure locale du navigateur. Pour comparer
    correctement quel que soit le fuseau du serveur, on reconstruit "maintenant" a
    l'heure du client a partir de son decalage UTC (tz_offset_minutes, minutes a l'est).

    Retourne un dict decrivant l'estimation. 'available' vaut False si le profil
    (poids/sexe) n'est pas renseigne ; 'has_drinks' indique si une soiree est en cours.
    """
    try:
        beer_abv = float(beer_abv)
    except (TypeError, ValueError):
        beer_abv = 5.0
    if beer_abv <= 0:
        beer_abv = 5.0

    try:
        legal_limit = float(legal_limit)
    except (TypeError, ValueError):
        legal_limit = LEGAL_BAC_LIMIT
    if legal_limit < 0:
        legal_limit = LEGAL_BAC_LIMIT

    if reference_datetime is not None:
        now = reference_datetime
    elif tz_offset_minutes is not None:
        now = datetime.utcnow() + timedelta(minutes=tz_offset_minutes)
    else:
        now = datetime.now()
    current_evening_date = now.date()
    if now.hour < rollover_hour:
        current_evening_date -= timedelta(days=1)
    current_key = current_evening_date.isoformat()

    records = Database.get_consumption(user_id)

    # Liste des prises de la soiree en cours (litres + horodatage), independamment du profil.
    evening_drinks = []
    for record in records:
        evening_date, chronological_datetime = get_evening_reference(record, rollover_hour)
        if evening_date.isoformat() != current_key:
            continue
        pints = record['pints'] or 0
        half_pints = record['half_pints'] or 0
        liters_33 = record['liters_33'] or 0
        liters = (pints * 0.5) + (half_pints * 0.25) + (liters_33 * 0.33)
        if liters == 0:
            continue
        evening_drinks.append((chronological_datetime, liters))

    # Deduire les retraits (litres negatifs) des prises positives : sinon une biere
    # retiree resterait comptee dans le taux.
    evening_drinks = _net_evening_drinks(evening_drinks)
    has_drinks = len(evening_drinks) > 0

    if not weight_kg or weight_kg <= 0 or sex not in ('m', 'f'):
        return {'available': False, 'has_drinks': has_drinks}

    if not has_drinks:
        return {'available': True, 'has_drinks': False, 'bac': 0.0}

    # Pour chaque prise : son "pic" d'alcoolemie (contribution une fois totalement
    # absorbee) et la part deja absorbee a l'instant present (montee progressive).
    r = WIDMARK_R_MALE if sex == 'm' else WIDMARK_R_FEMALE
    total_peak = 0.0     # taux atteint une fois toutes les prises absorbees
    absorbed_now = 0.0   # taux effectivement absorbe a l'instant present
    first_datetime = None
    peaks = []           # (horodatage, pic) de chaque prise, pour tracer la courbe
    for chronological_datetime, liters in evening_drinks:
        grams = liters * beer_abv * ETHANOL_G_PER_LITER_PER_DEGREE
        peak = grams / (weight_kg * r)
        total_peak += peak
        absorbed_now += peak * _absorbed_fraction(now, chronological_datetime)
        peaks.append((chronological_datetime, peak))
        if first_datetime is None or chronological_datetime < first_datetime:
            first_datetime = chronological_datetime

    hours_elapsed = max(0.0, (now - first_datetime).total_seconds() / 3600.0)
    eliminated = ELIMINATION_RATE_PER_HOUR * hours_elapsed
    bac = max(0.0, absorbed_now - eliminated)

    # Projections "quand puis-je reconduire / etre a zero" : elles se basent sur le pic
    # une fois TOUT absorbe (total_peak), pas sur le taux partiel actuel. Sinon, juste
    # apres une biere encore en cours d'absorption, on annoncerait a tort une descente.
    sober_legal_at = None
    sober_at = None
    if ELIMINATION_RATE_PER_HOUR > 0:
        hours_to_legal = (total_peak - legal_limit) / ELIMINATION_RATE_PER_HOUR - hours_elapsed
        if hours_to_legal > 0:
            sober_legal_at = (now + timedelta(hours=hours_to_legal)).isoformat(timespec='seconds')
        hours_to_zero = total_peak / ELIMINATION_RATE_PER_HOUR - hours_elapsed
        if hours_to_zero > 0:
            sober_at = (now + timedelta(hours=hours_to_zero)).isoformat(timespec='seconds')

    # On ne peut conduire que si l'on est sous le seuil maintenant ET destine a y rester
    # (une prise en cours d'absorption peut faire repasser au-dessus).
    can_drive = bac < legal_limit and sober_legal_at is None

    # Courbe modelisee du taux, du debut de soiree jusqu'au retour a 0. La fonction est
    # lineaire par morceaux : on l'evalue a chaque point de rupture (chaque prise, chaque
    # fin d'absorption) plus l'instant de retour a 0. La courbe se recalcule donc a chaque
    # ajout / retrait de biere de la soiree.
    curve = []
    if ELIMINATION_RATE_PER_HOUR > 0:
        zero_datetime = first_datetime + timedelta(hours=total_peak / ELIMINATION_RATE_PER_HOUR)
        breakpoints = {first_datetime, zero_datetime}
        for drink_datetime, _peak in peaks:
            breakpoints.add(drink_datetime)
            breakpoints.add(drink_datetime + timedelta(hours=ABSORPTION_HOURS))
        for moment in sorted(m for m in breakpoints if first_datetime <= m <= zero_datetime):
            absorbed = sum(peak * _absorbed_fraction(moment, t) for t, peak in peaks)
            elapsed = (moment - first_datetime).total_seconds() / 3600.0
            value = max(0.0, absorbed - ELIMINATION_RATE_PER_HOUR * elapsed)
            curve.append({'t': moment.isoformat(timespec='seconds'), 'bac': round(value, 3)})

    return {
        'available': True,
        'has_drinks': True,
        'bac': round(bac, 2),
        'legal_limit': round(legal_limit, 2),
        'can_drive': can_drive,
        'sober_legal_at': sober_legal_at,
        'sober_at': sober_at,
        'now': now.isoformat(timespec='seconds'),
        'curve': curve,
    }


def peak_bac_for_evening(user_id, evening_key, weight_kg, sex, beer_abv=5.0, rollover_hour=EVENING_ROLLOVER_HOUR):
    """Estimer le pic d'alcoolemie atteint durant une soiree donnee (formule de Widmark).

    Chaque prise est absorbee progressivement (montee lineaire sur ABSORPTION_HOURS),
    l'elimination etant lineaire en parallele. Le taux resultant est une fonction
    lineaire par morceaux : son maximum se trouve donc a un point de rupture, c.-a-d.
    a l'instant d'une prise ou a la fin de l'absorption d'une prise. Retourne un taux
    g/L, ou None si le profil (poids/sexe) manque ou si la soiree n'a aucune consommation.
    """
    if not weight_kg or weight_kg <= 0 or sex not in ('m', 'f') or not evening_key:
        return None

    try:
        beer_abv = float(beer_abv)
    except (TypeError, ValueError):
        beer_abv = 5.0
    if beer_abv <= 0:
        beer_abv = 5.0

    records = Database.get_consumption(user_id)
    drinks = []
    for record in records:
        evening_date, chronological_datetime = get_evening_reference(record, rollover_hour)
        if evening_date.isoformat() != evening_key:
            continue
        pints = record['pints'] or 0
        half_pints = record['half_pints'] or 0
        liters_33 = record['liters_33'] or 0
        liters = (pints * 0.5) + (half_pints * 0.25) + (liters_33 * 0.33)
        if liters == 0:
            continue
        drinks.append((chronological_datetime, liters))

    # Deduire les retraits (litres negatifs) des prises positives, comme pour
    # l'estimation en direct, afin que le pic reflete les bieres retirees.
    drinks = _net_evening_drinks(drinks)
    if not drinks:
        return None

    r = WIDMARK_R_MALE if sex == 'm' else WIDMARK_R_FEMALE
    first_datetime = drinks[0][0]
    peaks = [
        (chronological_datetime, liters * beer_abv * ETHANOL_G_PER_LITER_PER_DEGREE / (weight_kg * r))
        for chronological_datetime, liters in drinks
    ]

    # Le taux est lineaire par morceaux ; on l'evalue a chaque point de rupture (chaque
    # prise et chaque fin d'absorption) et on retient le maximum.
    candidate_times = set()
    for chronological_datetime, _ in peaks:
        candidate_times.add(chronological_datetime)
        candidate_times.add(chronological_datetime + timedelta(hours=ABSORPTION_HOURS))

    peak = 0.0
    for moment in candidate_times:
        absorbed = sum(p * _absorbed_fraction(moment, t) for t, p in peaks)
        hours_elapsed = max(0.0, (moment - first_datetime).total_seconds() / 3600.0)
        bac_at = absorbed - ELIMINATION_RATE_PER_HOUR * hours_elapsed
        if bac_at > peak:
            peak = bac_at

    return round(max(0.0, peak), 2)


def check_record_evening_beaten(user_id, reference_datetime=None, rollover_hour=EVENING_ROLLOVER_HOUR):
    """Détecte si la soirée en cours a battu le précédent record de consommation.

    Retourne un dict décrivant le nouveau record, ou None si aucun record battu.
    """
    records = Database.get_consumption(user_id)
    if not records:
        return None

    # Total de litres agrégé par soirée
    evening_totals = {}
    for record in records:
        evening_date, _ = get_evening_reference(record, rollover_hour)
        pints = record['pints'] or 0
        half_pints = record['half_pints'] or 0
        liters_33 = record['liters_33'] or 0
        liters = (pints * 0.5) + (half_pints * 0.25) + (liters_33 * 0.33)
        key = evening_date.isoformat()
        evening_totals[key] = evening_totals.get(key, 0) + liters

    # Soirée en cours (peut avoir démarré la veille avant le rollover)
    now = reference_datetime or datetime.now()
    current_evening_date = now.date()
    if now.hour < rollover_hour:
        current_evening_date -= timedelta(days=1)
    current_key = current_evening_date.isoformat()

    current_total = evening_totals.get(current_key, 0)
    if current_total <= 0:
        return None

    previous_evenings = [(key, total) for key, total in evening_totals.items() if key != current_key]
    if not previous_evenings:
        return None  # Aucun record antérieur à battre

    previous_key, previous_record = max(previous_evenings, key=lambda item: (item[1], item[0]))
    if current_total <= previous_record:
        return None

    return {
        'evening_date': current_key,
        'total_liters': round(current_total, 2),
        'previous_record_liters': round(previous_record, 2),
        'previous_record_date': previous_key,
    }

def _all_time_record_evening(user_id, rollover_hour=EVENING_ROLLOVER_HOUR):
    """Retourne (date_iso, litres) de la soiree la plus consommee, ou None."""
    records = Database.get_consumption(user_id)
    if not records:
        return None

    evening_totals = {}
    for record in records:
        evening_date, _ = get_evening_reference(record, rollover_hour)
        pints = record['pints'] or 0
        half_pints = record['half_pints'] or 0
        liters_33 = record['liters_33'] or 0
        liters = (pints * 0.5) + (half_pints * 0.25) + (liters_33 * 0.33)
        key = evening_date.isoformat()
        evening_totals[key] = evening_totals.get(key, 0) + liters

    if not evening_totals:
        return None

    record_key, record_liters = max(evening_totals.items(), key=lambda item: (item[1], item[0]))
    if record_liters <= 0:
        return None
    return record_key, record_liters


def sync_record_evening(user_id):
    """Synchronise le nom de la soiree record avec le record absolu courant.

    Si une soiree differente detient desormais le record, l'ancien nom est oublie.
    Retourne {'date', 'total_liters', 'name'} ou None si aucune soiree consommee.
    """
    record = _all_time_record_evening(user_id)
    if record is None:
        return None

    record_key, record_liters = record
    meta = Database.get_record_evening_meta(user_id)
    name = meta['name']

    # Le record a change de soiree : on oublie le nom precedent.
    if meta['date'] != record_key:
        name = None
        Database.set_record_evening_meta(user_id, record_key, None)

    return {
        'date': record_key,
        'total_liters': round(record_liters, 2),
        'name': name,
    }


def set_record_evening_name(user_id, name):
    """Nomme la soiree record courante (nom optionnel, vide = efface).

    Retourne l'etat mis a jour, ou None si aucune soiree record n'existe.
    """
    record = sync_record_evening(user_id)
    if record is None:
        return None

    cleaned = (name or '').strip()
    if not cleaned:
        cleaned = None
    elif len(cleaned) > 100:
        cleaned = cleaned[:100]

    Database.set_record_evening_meta(user_id, record['date'], cleaned)
    record['name'] = cleaned
    return record


def calculate_stats(
    user_id,
    start_date=None,
    end_date=None,
    three_hour_threshold_liters=1.5,
    weekly_drinking_days_threshold=3,
    water_reminder_threshold_liters=1.0
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
                # (un seuil de 0 désactive l'alerte sur 3 heures)
                if three_hour_threshold_liters > 0 and window_liters >= three_hour_threshold_liters:
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
    # (un seuil de 0 désactive l'alerte sur les jours de consommation)
    is_weekly_threshold_reached = False
    drinking_days = []
    if weekly_drinking_days_threshold > 0:
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
    
    # Vérifier si la soirée en cours a battu le record de consommation
    record_evening_alert = check_record_evening_beaten(user_id)
    if record_evening_alert:
        three_hour_warnings.append({
            'type': 'record',
            'start_time': '00:00:00',
            'end_time': '23:59:59',
            'total_liters': record_evening_alert['total_liters'],
            'previous_record_liters': record_evening_alert['previous_record_liters'],
            'previous_record_date': record_evening_alert['previous_record_date'],
            'start_date': record_evening_alert['evening_date'],
            'end_date': record_evening_alert['evening_date'],
            'items': [],
        })

    # Rappel de boire un verre d'eau au-delà d'un certain volume sur la soirée
    # (un seuil de 0 désactive l'alerte)
    if water_reminder_threshold_liters > 0:
        current_evening_total = get_current_evening_total(user_id)
        if current_evening_total >= water_reminder_threshold_liters:
            # L'alerte disparait automatiquement 2h apres la derniere biere.
            last_datetime = get_current_evening_last_datetime(user_id)
            expires_at = (
                (last_datetime + timedelta(hours=2)).isoformat(timespec='seconds')
                if last_datetime else None
            )
            three_hour_warnings.append({
                'type': 'water',
                'start_time': '00:00:00',
                'end_time': '23:59:59',
                'total_liters': current_evening_total,
                'threshold_liters': round(water_reminder_threshold_liters, 2),
                'start_date': today_str,
                'end_date': today_str,
                'expires_at': expires_at,
                'items': [],
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
