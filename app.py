from flask import Flask, render_template, request, session, redirect, url_for, jsonify, send_file, flash
from datetime import datetime, timedelta, date
from models import Database
from auth import hash_password, verify_password, login_required, admin_required, verify_user_exists, bcrypt
from utils import calculate_stats, export_csv, import_csv, get_top_drinkers, get_top_drinkers_for_month, get_top_drinkers_for_week, calculate_weekly_stats
from config import Config
from flask_wtf.csrf import CSRFProtect
from i18n import get_request_language, t
import os
import uuid
import logging
import io

app = Flask(__name__)
app.config.from_object(Config)
bcrypt.init_app(app)
csrf = CSRFProtect(app)

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] - %(name)s - %(levelname)s - %(message)s',
    datefmt='%d/%b/%Y %H:%M:%S'
)
logger = logging.getLogger(__name__)

def build_tied_podium(drinkers, max_medals=3):
    """Construit un podium (or/argent/bronze) en regroupant les ex-aequo."""
    podium = []

    for drinker in drinkers:
        liters = drinker['total_liters'] if drinker['total_liters'] is not None else 0
        if liters <= 0:
            # Pas de médaille si aucune consommation
            break

        if not podium:
            podium.append({'medal_index': 1, 'total_liters': liters, 'users': [drinker]})
            continue

        last_group = podium[-1]
        if liters == last_group['total_liters']:
            last_group['users'].append(drinker)
            continue

        if len(podium) >= max_medals:
            break

        podium.append({
            'medal_index': len(podium) + 1,
            'total_liters': liters,
            'users': [drinker]
        })

    return podium

def podium_has_drinks(podium):
    return bool(podium) and (podium[0]['total_liters'] or 0) > 0

def build_other_rankings(drinkers, podium):
    """Construit le classement des utilisateurs hors podium avec rang et litres."""
    podium_usernames = {
        user['username']
        for group in podium
        for user in group['users']
    }
    others = []
    previous_liters = None
    current_rank = 0

    for index, drinker in enumerate(drinkers, start=1):
        liters = drinker['total_liters'] if drinker['total_liters'] is not None else 0
        if previous_liters is None or liters != previous_liters:
            current_rank = index
            previous_liters = liters

        if drinker['username'] in podium_usernames:
            continue

        others.append({
            'rank': current_rank,
            'username': drinker['username'],
            'total_liters': liters
        })

    return others

def current_week_range():
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


@app.context_processor
def inject_language():
    return {"lang": get_request_language()}

# Initialiser la base de données au démarrage
Database.init_db()

admin_username = os.environ.get("ADMIN_USERNAME", "admin")
admin_password = os.environ.get("ADMIN_PASSWORD")

if not admin_password:
    raise RuntimeError("ADMIN_PASSWORD must be set")

admin_password_hash = hash_password(admin_password)

conn = Database.get_connection()
cursor = conn.cursor()

cursor.execute(
    "SELECT id FROM users WHERE username = %s AND is_admin = 1",
    (admin_username,)
)
admin = cursor.fetchone()

if admin:
    # Mise à jour systématique
    cursor.execute(
        "UPDATE users SET password = %s WHERE username = %s AND is_admin = 1",
        (admin_password_hash, admin_username)
    )
else:
    # Création
    cursor.execute(
        "INSERT INTO users (id, username, password, is_admin) VALUES (%s, %s, %s, 1)",
        (str(uuid.uuid4()), admin_username, admin_password_hash)
    )

conn.commit()
conn.close()

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    # Si déjà connecté alors redirection vers dashboard
    if 'user_id' in session:
        if verify_user_exists(session['user_id']):
            if session.get('is_admin'):
                return redirect(url_for('admin'))
            return redirect(url_for('dashboard'))
        else:
            session.clear()
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        client_ip = request.remote_addr
        
        # Vérifier si l'utilisateur classique existe
        if Database.user_exists(username):
            user_id = Database.get_user_id(username)
            conn = Database.get_connection()
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, password, is_admin, force_password_change FROM users WHERE username = %s',
                (username,)
            )
            user = cursor.fetchone()
            conn.close()
            
            if user and verify_password(password, user['password']):
                app.logger.info(f'{client_ip} Authentification successful for user {username}')
                session.clear()  # rotation de session
                session['user_id'] = user['id']
                session['username'] = username
                session['is_admin'] = bool(user['is_admin'])
                session['force_password_change'] = bool(user.get('force_password_change')) or password == "changeme123"
                session.permanent = True
                return redirect(url_for('index'))

            else:
                # Mot de passe utilisateur incorrect
                app.logger.warning(f'{client_ip} Authentification failed for user {username} (incorrect password)')
                return render_template('login.html', error=t("login_incorrect_password"))
        else:
            # Utilisateur n'existe pas
            app.logger.warning(f'{client_ip} Authentification failed for user {username} (unknown user)')
            return render_template('login.html', error=t("login_unknown_user"))
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    if session.get('is_admin'):
        return redirect(url_for('admin'))

    current_year = date.today().year
    current_month = date.today().month
    week_start, week_end = current_week_range()
    top_week_drinkers = get_top_drinkers_for_week()
    top_month_drinkers = get_top_drinkers_for_month(current_year, current_month)
    top_drinkers = get_top_drinkers(current_year)
    top_week_podium = build_tied_podium(top_week_drinkers)
    top_month_podium = build_tied_podium(top_month_drinkers)
    top_year_podium = build_tied_podium(top_drinkers)
    weekly_has_drinks = podium_has_drinks(top_week_podium)
    monthly_has_drinks = podium_has_drinks(top_month_podium)
    yearly_has_drinks = podium_has_drinks(top_year_podium)
    weekly_other_rankings = build_other_rankings(top_week_drinkers, top_week_podium) if weekly_has_drinks else []
    monthly_other_rankings = build_other_rankings(top_month_drinkers, top_month_podium) if monthly_has_drinks else []
    yearly_other_rankings = build_other_rankings(top_drinkers, top_year_podium) if yearly_has_drinks else []

    show_weekly_ranking = len(top_week_drinkers) >= 1
    show_monthly_ranking = len(top_month_drinkers) >= 1
    show_ranking = len(top_drinkers) >= 1

    return render_template(
        'dashboard.html',
        username=session['username'],
        top_week_podium=top_week_podium,
        top_month_podium=top_month_podium,
        top_year_podium=top_year_podium,
        weekly_other_rankings=weekly_other_rankings,
        monthly_other_rankings=monthly_other_rankings,
        yearly_other_rankings=yearly_other_rankings,
        weekly_has_drinks=weekly_has_drinks,
        monthly_has_drinks=monthly_has_drinks,
        yearly_has_drinks=yearly_has_drinks,
        show_weekly_ranking=show_weekly_ranking,
        show_monthly_ranking=show_monthly_ranking,
        show_ranking=show_ranking,
        ranking_week_start=week_start.isoformat(),
        ranking_week_end=week_end.isoformat(),
        ranking_month=current_month,
        ranking_year=current_year,
        force_password_change=session.get('force_password_change', False)
    )

@app.route('/api/consumption', methods=['GET', 'POST'])
@login_required
def api_consumption():
    user_id = session['user_id']
    
    if request.method == 'POST':
        data = request.get_json()
        consumption_date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
        time = data.get('time', datetime.now().strftime('%H:%M:%S'))
        pints = int(data.get('pints', 0))
        half_pints = int(data.get('half_pints', 0))
        liters_33 = int(data.get('liters_33', 0))
        
        Database.add_consumption(user_id, consumption_date, pints, half_pints, liters_33, time)
        
        return jsonify({'success': True})
    
    # GET - récupérer les stats
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    user_settings = Database.get_user_settings(user_id)
    three_hour_threshold_liters = user_settings['three_hour_threshold_liters']
    weekly_drinking_days_threshold = user_settings['weekly_drinking_days_threshold']
    stats = calculate_stats(
        user_id,
        start_date,
        end_date,
        three_hour_threshold_liters,
        weekly_drinking_days_threshold
    )
    today = date.today()
    current_month_start = today.replace(day=1)
    previous_month_end = current_month_start - timedelta(days=1)
    previous_month_start = previous_month_end.replace(day=1)
    monthly_chart_stats = calculate_stats(
        user_id,
        previous_month_start.isoformat(),
        today.isoformat(),
        three_hour_threshold_liters,
        weekly_drinking_days_threshold
    )['monthly_stats']
    for month in (previous_month_start, current_month_start):
        monthly_chart_stats.setdefault(
            month.strftime('%Y-%m'),
            {'pints': 0, 'half_pints': 0, '33cl': 0}
        )
    weekly_stats = calculate_weekly_stats(user_id)  # AJOUTER CETTE LIGNE
    
    return jsonify({
        'total_pints': stats['total_pints'],
        'total_half_pints': stats['total_half_pints'],
        'total_33cl': stats['total_33cl'],
        'total_liters': stats['total_liters'],
        'warnings': stats['warnings'], 
        'settings': user_settings,
        'monthly_stats': stats['monthly_stats'],
        'monthly_chart_stats': monthly_chart_stats,
        'records': [dict(record) for record in stats['all_records']],
        'weekly_stats': weekly_stats  # AJOUTER CETTE LIGNE
    })

@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def api_settings():
    user_id = session['user_id']

    if request.method == 'GET':
        return jsonify(Database.get_user_settings(user_id))

    data = request.get_json() or {}
    current_settings = Database.get_user_settings(user_id)

    try:
        three_hour_threshold_liters = float(data.get(
            'three_hour_threshold_liters',
            current_settings['three_hour_threshold_liters']
        ))
        weekly_drinking_days_threshold = int(data.get(
            'weekly_drinking_days_threshold',
            current_settings['weekly_drinking_days_threshold']
        ))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': t('invalid_settings')}), 400

    if (
        three_hour_threshold_liters < 0.1
        or three_hour_threshold_liters > 10
        or weekly_drinking_days_threshold < 2
        or weekly_drinking_days_threshold > 7
    ):
        return jsonify({'success': False, 'message': t('invalid_settings')}), 400

    Database.update_user_settings(
        user_id,
        round(three_hour_threshold_liters, 2),
        weekly_drinking_days_threshold
    )

    return jsonify({
        'success': True,
        'three_hour_threshold_liters': round(three_hour_threshold_liters, 2),
        'weekly_drinking_days_threshold': weekly_drinking_days_threshold
    })

@app.route('/api/rankings', methods=['GET'])
@login_required
def api_rankings():
    if session.get('is_admin'):
        return jsonify({
            'weekly_podium': [],
            'monthly_podium': [],
            'yearly_podium': [],
            'weekly_has_drinks': False,
            'monthly_has_drinks': False,
            'yearly_has_drinks': False,
            'weekly_others': [],
            'monthly_others': [],
            'yearly_others': [],
            'show_weekly_ranking': False,
            'show_monthly_ranking': False,
            'show_ranking': False
        })

    current_year = date.today().year
    current_month = date.today().month
    top_week_drinkers = get_top_drinkers_for_week()
    top_month_drinkers = get_top_drinkers_for_month(current_year, current_month)
    top_drinkers = get_top_drinkers(current_year)
    top_week_podium = build_tied_podium(top_week_drinkers)
    top_month_podium = build_tied_podium(top_month_drinkers)
    top_year_podium = build_tied_podium(top_drinkers)
    weekly_has_drinks = podium_has_drinks(top_week_podium)
    monthly_has_drinks = podium_has_drinks(top_month_podium)
    yearly_has_drinks = podium_has_drinks(top_year_podium)
    weekly_other_rankings = build_other_rankings(top_week_drinkers, top_week_podium) if weekly_has_drinks else []
    monthly_other_rankings = build_other_rankings(top_month_drinkers, top_month_podium) if monthly_has_drinks else []
    yearly_other_rankings = build_other_rankings(top_drinkers, top_year_podium) if yearly_has_drinks else []

    def serialize_group(group):
        return {
            'medal_index': group['medal_index'],
            'total_liters': group['total_liters'],
            'users': [{'username': user['username']} for user in group['users']]
        }

    return jsonify({
        'weekly_podium': [serialize_group(group) for group in top_week_podium],
        'monthly_podium': [serialize_group(group) for group in top_month_podium],
        'yearly_podium': [serialize_group(group) for group in top_year_podium],
        'weekly_others': weekly_other_rankings,
        'monthly_others': monthly_other_rankings,
        'yearly_others': yearly_other_rankings,
        'weekly_has_drinks': weekly_has_drinks,
        'monthly_has_drinks': monthly_has_drinks,
        'yearly_has_drinks': yearly_has_drinks,
        'show_weekly_ranking': len(top_week_drinkers) >= 1,
        'show_monthly_ranking': len(top_month_drinkers) >= 1,
        'show_ranking': len(top_drinkers) >= 1
    })

@app.route('/api/export', methods=['GET'])
@login_required
def api_export():
    user_id = session['user_id']
    csv_data = export_csv(user_id)
    
    return send_file(
        io.BytesIO(csv_data.encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f"consommation_{session['username']}.csv"
    )

@app.route('/admin')
@admin_required
def admin():
    users = Database.get_all_users()
    current_year = date.today().year
    top_drinkers = get_top_drinkers(current_year)
    
    return render_template('admin.html', users=users, top_drinkers=top_drinkers, ranking_year=current_year)

@app.route('/admin/user/create', methods=['POST'])
@admin_required
def admin_create_user():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()

    if not username or not password:
        flash(t("admin_user_required"), "error")
        return redirect(url_for('admin'))  

    password_hash = hash_password(password)
    success, _ = Database.create_user(username, password_hash)

    flash(t("admin_user_created") if success else t("admin_user_create_error"), "success" if success else "error")
    return redirect(url_for('admin'))  

@app.route('/admin/user/<user_id>/delete', methods=['POST'])
@admin_required
def admin_delete_user(user_id):
    Database.delete_user(user_id)
    return redirect(url_for('admin'))

@app.route('/admin/user/<user_id>/force-password-change', methods=['POST'])
@admin_required
def admin_force_password_change(user_id):
    required = request.form.get('force_password_change') == 'on'
    Database.set_force_password_change_by_id(user_id, required)
    return redirect(url_for('admin'))

@app.route('/admin/user/<user_id>/password', methods=['POST'])
@admin_required
def admin_change_password(user_id):
    new_password = request.form.get('password', '').strip()
    
    conn = Database.get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT username FROM users WHERE id = %s', (user_id,))
    result = cursor.fetchone()
    conn.close()
    
    if result:
        username = result['username']
        password_hash = hash_password(new_password)
        Database.update_user_password(username, password_hash)
    
    return redirect(url_for('admin'))

@app.route('/admin/export', methods=['GET'])
@admin_required
def admin_export():
    csv_data = export_csv(all_users=True)
    
    return send_file(
        io.BytesIO(csv_data.encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f"consommation_complete_{datetime.now().strftime('%Y%m%d')}.csv"
    )

@app.route('/admin/import', methods=['POST'])
@admin_required
def admin_import():
    if 'file' not in request.files:
        flash(t("admin_no_file_sent"), "error")
        return redirect(url_for('admin'))

    file = request.files['file']
    if not file.filename:
        flash(t("admin_no_file_selected"), "error")
        return redirect(url_for('admin'))

    imported_count, errors, created_users = import_csv(file.read(), all_users=True)

    # Construit le message (reprend ta logique actuelle)
    message = t("admin_import_completed", count=imported_count)
    if created_users:
        message += f"\n{t('admin_import_users_created', count=len(created_users))}"
        for u in created_users:
            message += f"\n- {u['username']} / {u['password']}"
        message += f"\n{t('admin_import_important')}"
    if errors:
        message += f"\n{t('admin_import_errors', count=len(errors))}"
        for e in errors:
            message += f"\n- {e}"

    flash(message, "success" if imported_count > 0 and not errors else "warning")
    return redirect(url_for('admin'))

@app.route('/api/night-mode', methods=['GET', 'POST'])
@login_required
def night_mode():
    """Gérer le mode soirée"""
    if request.method == 'GET':
        user_id = session['user_id']
        is_enabled = Database.get_night_mode_status(user_id)
        return jsonify({'night_mode_enabled': is_enabled})
    
    if request.method == 'POST':
        data = request.get_json()
        user_id = session['user_id']
        enabled = data.get('enabled', False)
        
        Database.set_night_mode(user_id, enabled)
        
        return jsonify({
            'success': True,
            'night_mode_enabled': enabled
        })

# Endpoint admin pour gérer le mode soirée d'autres utilisateurs
@app.route('/admin/night-mode/<user_id>', methods=['POST'])
@admin_required
def toggle_night_mode(user_id):
    """Admin: Basculer le mode soirée (vrai toggle)"""
    # Récupérer l'état actuel
    current_state = Database.get_night_mode_status(user_id)
    
    # Inverser l'état
    new_state = not current_state
    
    # Appliquer le changement
    Database.set_night_mode(user_id, new_state)
    
    action = t("night_mode_enabled") if new_state else t("night_mode_disabled")
    return jsonify({'success': True, 'message': action})


@app.route('/api/night-mode-status/<user_id>', methods=['GET'])
@admin_required
def get_night_mode_status(user_id):
    """Admin: Récupère l'état du mode soirée pour un utilisateur"""
    is_enabled = Database.get_night_mode_status(user_id)
    return jsonify({'night_mode_enabled': is_enabled})

@app.route('/change-password', methods=['GET', 'POST'])
@login_required
def change_password():
    """Permet à un utilisateur de changer son mot de passe"""
    wants_json = (
        request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        or request.accept_mimetypes.best == 'application/json'
    )

    def password_response(success=False, message=None, status=200):
        if wants_json:
            return jsonify({'success': success, 'message': message}), status
        template_key = 'success' if success else 'error'
        return render_template(
            'password.html',
            **{template_key: message},
            username=session['username']
        ), status
    
    # Bloquer l'accès pour l'administrateur
    if session.get('is_admin'):
        return redirect(url_for('admin'))
    
    if request.method == 'POST':
        password_change_required = bool(session.get('force_password_change'))
        current_password = request.form.get('current_password', '').strip()
        new_password = request.form.get('new_password', '').strip()
        confirm_password = request.form.get('confirm_password', '').strip()
        
        # Validation
        if (not password_change_required and not current_password) or not new_password or not confirm_password:
            return password_response(False, t("password_all_fields_required"), 400)
        
        if new_password != confirm_password:
            return password_response(False, t("password_mismatch"), 400)
        
        if len(new_password) < 6:
            return password_response(False, t("password_too_short"), 400)
        
        username = session['username']
        if not password_change_required:
            # Vérifier le mot de passe actuel
            conn = Database.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT password FROM users WHERE username = %s", (username,))
            user = cursor.fetchone()
            conn.close()

            if not user or not verify_password(current_password, user['password']):
                return password_response(False, t("password_current_incorrect"), 400)
        
        # Changer le mot de passe
        password_hash = hash_password(new_password)
        Database.update_user_password(username, password_hash)
        Database.set_force_password_change(username, False)
        session['force_password_change'] = False
        
        app.logger.info(f"Password changed successfully for user {username}")
        return password_response(True, t("password_changed_success"))
    
    return redirect(url_for('dashboard'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=(Config.APP_PORT), debug=False)
