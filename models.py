import os
from datetime import datetime, timedelta
import uuid

import pymysql
from pymysql.cursors import DictCursor

DB_HOST = os.environ.get('DB_HOST', 'mariadb')
DB_PORT = int(os.environ.get('DB_PORT', '3306'))
DB_NAME = os.environ.get('DB_NAME', 'zytholo')
DB_USER = os.environ.get('DB_USER', 'zytholo')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')


class Database:
    @staticmethod
    def init_db():
        """Initialiser le schema de la base de donnees MariaDB"""
        conn = Database.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS users (
                id CHAR(36) PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                is_admin TINYINT(1) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                night_mode_until DATETIME DEFAULT NULL,
                force_password_change TINYINT(1) DEFAULT 0,
                three_hour_threshold_liters DECIMAL(4,2) DEFAULT 1.50,
                weekly_drinking_days_threshold INT DEFAULT 3,
                water_reminder_threshold_liters DECIMAL(4,2) DEFAULT 1.00,
                weight_kg DECIMAL(5,1) DEFAULT NULL,
                sex CHAR(1) DEFAULT NULL,
                beer_abv DECIMAL(3,1) DEFAULT 5.0,
                legal_bac_limit DECIMAL(3,2) DEFAULT 0.50,
                record_evening_date DATE DEFAULT NULL,
                record_evening_name VARCHAR(100) DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            '''
        )

        cursor.execute(
            '''
            SELECT COUNT(*) AS column_exists
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = 'force_password_change'
            '''
        )
        if not cursor.fetchone()['column_exists']:
            cursor.execute(
                '''
                ALTER TABLE users
                ADD COLUMN force_password_change TINYINT(1) DEFAULT 0
                '''
            )

        cursor.execute(
            '''
            SELECT COUNT(*) AS column_exists
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = 'three_hour_threshold_liters'
            '''
        )
        if not cursor.fetchone()['column_exists']:
            cursor.execute(
                '''
                ALTER TABLE users
                ADD COLUMN three_hour_threshold_liters DECIMAL(4,2) DEFAULT 1.50
                '''
            )

        cursor.execute(
            '''
            SELECT COUNT(*) AS column_exists
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = 'weekly_drinking_days_threshold'
            '''
        )
        if not cursor.fetchone()['column_exists']:
            cursor.execute(
                '''
                ALTER TABLE users
                ADD COLUMN weekly_drinking_days_threshold INT DEFAULT 3
                '''
            )

        cursor.execute(
            '''
            SELECT COUNT(*) AS column_exists
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = 'water_reminder_threshold_liters'
            '''
        )
        if not cursor.fetchone()['column_exists']:
            cursor.execute(
                '''
                ALTER TABLE users
                ADD COLUMN water_reminder_threshold_liters DECIMAL(4,2) DEFAULT 1.00
                '''
            )

        for column_name, column_definition in (
            ('weight_kg', 'DECIMAL(5,1) DEFAULT NULL'),
            ('sex', 'CHAR(1) DEFAULT NULL'),
            ('beer_abv', 'DECIMAL(3,1) DEFAULT 5.0'),
            ('legal_bac_limit', 'DECIMAL(3,2) DEFAULT 0.50'),
            ('record_evening_date', 'DATE DEFAULT NULL'),
            ('record_evening_name', 'VARCHAR(100) DEFAULT NULL'),
        ):
            cursor.execute(
                '''
                SELECT COUNT(*) AS column_exists
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'users'
                  AND COLUMN_NAME = %s
                ''',
                (column_name,),
            )
            if not cursor.fetchone()['column_exists']:
                cursor.execute(
                    f'ALTER TABLE users ADD COLUMN {column_name} {column_definition}'
                )

        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS consumption (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id CHAR(36) NOT NULL,
                date DATE NOT NULL,
                time TIME NOT NULL DEFAULT '00:00:00',
                pints INT DEFAULT 0,
                half_pints INT DEFAULT 0,
                liters_33 INT DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_date_time (user_id, date, time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            '''
        )

        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(255) NOT NULL,
                user_id CHAR(36) DEFAULT NULL,
                success TINYINT(1) NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_username_attempted (username, attempted_at),
                INDEX idx_user_id_attempted (user_id, attempted_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            '''
        )

        conn.commit()
        conn.close()

    @staticmethod
    def get_connection():
        """Obtenir une connexion MariaDB"""
        return pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4',
            autocommit=False,
            cursorclass=DictCursor,
        )

    @staticmethod
    def user_exists(username):
        """Verifier si un utilisateur existe"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM users WHERE username = %s', (username,))
        result = cursor.fetchone()
        conn.close()
        return result is not None

    @staticmethod
    def get_user_id(username):
        """Obtenir l'ID (UUID) d'un utilisateur"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM users WHERE username = %s', (username,))
        result = cursor.fetchone()
        conn.close()
        return result['id'] if result else None

    @staticmethod
    def create_user(username, password, force_password_change=False):
        """Creer un nouvel utilisateur avec UUID aleatoire"""
        if Database.user_exists(username):
            return False, "Un utilisateur avec ce nom existe deja"

        conn = Database.get_connection()
        cursor = conn.cursor()

        try:
            user_id = str(uuid.uuid4())
            cursor.execute(
                '''
                INSERT INTO users (id, username, password, force_password_change)
                VALUES (%s, %s, %s, %s)
                ''',
                (user_id, username, password, 1 if force_password_change else 0),
            )
            conn.commit()
            conn.close()
            return True, "Utilisateur cree avec succes"
        except pymysql.IntegrityError:
            conn.rollback()
            conn.close()
            return False, "Erreur lors de la creation de l'utilisateur"

    @staticmethod
    def update_user_password(username, new_password):
        """Mettre a jour le mot de passe d'un utilisateur"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE users SET password = %s WHERE username = %s',
            (new_password, username),
        )
        conn.commit()
        conn.close()

    @staticmethod
    def set_force_password_change(username, required):
        """Marquer un utilisateur comme devant changer son mot de passe."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE users SET force_password_change = %s WHERE username = %s',
            (1 if required else 0, username),
        )
        conn.commit()
        conn.close()

    @staticmethod
    def set_force_password_change_by_id(user_id, required):
        """Marquer un utilisateur comme devant changer son mot de passe via son id."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE users SET force_password_change = %s WHERE id = %s AND is_admin = 0',
            (1 if required else 0, user_id),
        )
        conn.commit()
        conn.close()

    @staticmethod
    def get_all_users():
        """Obtenir tous les utilisateurs"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, username, created_at, force_password_change, night_mode_until FROM users WHERE is_admin = 0 ORDER BY username'
        )
        users = cursor.fetchall()
        conn.close()
        return users

    # Champs quantitatifs d'une consommation (whitelist utilisee pour composer du SQL).
    CONSUMPTION_FIELDS = ('pints', 'half_pints', 'liters_33')

    @staticmethod
    def _cancel_consumption(cursor, user_id, date, field, amount):
        """Retirer `amount` unites de `field` en annulant les ajouts les plus recents
        de la meme journee (LIFO). Les lignes entierement videes sont supprimees afin
        qu'une biere retiree disparaisse completement, sans laisser de ligne negative
        dans l'historique, la soiree record ou l'export CSV."""
        if amount <= 0:
            return

        cursor.execute(
            f'''
            SELECT id, pints, half_pints, liters_33 FROM consumption
            WHERE user_id = %s AND date = %s AND {field} > 0
            ORDER BY time DESC, id DESC
            ''',
            (user_id, date),
        )
        rows = cursor.fetchall()

        remaining = amount
        for row in rows:
            if remaining <= 0:
                break

            available = row[field] or 0
            take = min(available, remaining)
            remaining -= take
            new_value = available - take

            other_fields_nonzero = any(
                (row[other] or 0) != 0
                for other in Database.CONSUMPTION_FIELDS
                if other != field
            )

            if new_value == 0 and not other_fields_nonzero:
                cursor.execute('DELETE FROM consumption WHERE id = %s', (row['id'],))
            else:
                cursor.execute(
                    f'UPDATE consumption SET {field} = %s WHERE id = %s',
                    (new_value, row['id']),
                )

    @staticmethod
    def add_consumption(user_id, date, pints=0, half_pints=0, liters_33=0, time='00:00:00'):
        """Ajouter une consommation avec heure (AJOUTER, non remplacer).

        Une quantite negative correspond a un retrait : au lieu d'inserer une ligne
        negative qui subsisterait, on annule les ajouts les plus recents du jour."""
        conn = Database.get_connection()
        cursor = conn.cursor()

        quantities = {'pints': pints, 'half_pints': half_pints, 'liters_33': liters_33}

        # Traiter d'abord les retraits (quantites negatives) en annulant les ajouts existants.
        for field, quantity in quantities.items():
            if quantity < 0:
                Database._cancel_consumption(cursor, user_id, date, field, -quantity)

        # Ne conserver que la partie positive pour l'ajout proprement dit.
        add_pints = max(pints, 0)
        add_half_pints = max(half_pints, 0)
        add_liters_33 = max(liters_33, 0)

        if add_pints or add_half_pints or add_liters_33:
            cursor.execute(
                'SELECT pints, half_pints, liters_33 FROM consumption WHERE user_id = %s AND date = %s AND time = %s',
                (user_id, date, time),
            )
            existing = cursor.fetchone()

            if existing:
                new_pints = (existing['pints'] or 0) + add_pints
                new_half_pints = (existing['half_pints'] or 0) + add_half_pints
                new_liters_33 = (existing['liters_33'] or 0) + add_liters_33

                cursor.execute(
                    '''
                    UPDATE consumption
                    SET pints = %s, half_pints = %s, liters_33 = %s
                    WHERE user_id = %s AND date = %s AND time = %s
                    ''',
                    (new_pints, new_half_pints, new_liters_33, user_id, date, time),
                )
            else:
                cursor.execute(
                    '''
                    INSERT INTO consumption (user_id, date, time, pints, half_pints, liters_33)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ''',
                    (user_id, date, time, add_pints, add_half_pints, add_liters_33),
                )

        conn.commit()
        conn.close()

    @staticmethod
    def get_consumption(user_id, start_date=None, end_date=None):
        """Obtenir la consommation d'un utilisateur"""
        conn = Database.get_connection()
        cursor = conn.cursor()

        query = '''
            SELECT
                id,
                user_id,
                DATE_FORMAT(date, '%%Y-%%m-%%d') AS date,
                TIME_FORMAT(time, '%%H:%%i:%%s') AS time,
                pints,
                half_pints,
                liters_33
            FROM consumption
            WHERE user_id = %s
        '''
        params = [user_id]

        if start_date:
            query += ' AND date >= %s'
            params.append(start_date)

        if end_date:
            query += ' AND date <= %s'
            params.append(end_date)

        query += ' ORDER BY date DESC, time DESC'

        cursor.execute(query, params)
        records = cursor.fetchall()
        conn.close()

        return records

    @staticmethod
    def get_first_consumption_date(user_id):
        """Date de la toute premiere consommation d'un utilisateur (ISO), ou None."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT DATE_FORMAT(MIN(date), '%%Y-%%m-%%d') AS first_date "
            'FROM consumption WHERE user_id = %s',
            (user_id,),
        )
        result = cursor.fetchone()
        conn.close()
        return result['first_date'] if result else None

    @staticmethod
    def get_consumption_for_all_users(start_date=None, end_date=None):
        """Obtenir la consommation de tous les utilisateurs non-admin."""
        conn = Database.get_connection()
        cursor = conn.cursor()

        query = '''
            SELECT
                consumption.id,
                consumption.user_id,
                users.username,
                DATE_FORMAT(consumption.date, '%%Y-%%m-%%d') AS date,
                TIME_FORMAT(consumption.time, '%%H:%%i:%%s') AS time,
                consumption.pints,
                consumption.half_pints,
                consumption.liters_33
            FROM consumption
            INNER JOIN users ON users.id = consumption.user_id
            WHERE users.is_admin = 0
        '''
        params = []

        if start_date:
            query += ' AND consumption.date >= %s'
            params.append(start_date)

        if end_date:
            query += ' AND consumption.date <= %s'
            params.append(end_date)

        query += ' ORDER BY users.username ASC, consumption.date DESC, consumption.time DESC'

        cursor.execute(query, params)
        records = cursor.fetchall()
        conn.close()

        return records

    @staticmethod
    def delete_user(user_id):
        """Supprimer un utilisateur et ses donnees"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM users WHERE id = %s', (user_id,))
        conn.commit()
        conn.close()

    @staticmethod
    def set_night_mode(user_id, enabled):
        """Active/Desactive le mode soiree"""
        conn = Database.get_connection()
        cursor = conn.cursor()

        if enabled:
            tomorrow_7am = datetime.now().replace(hour=7, minute=0, second=0, microsecond=0) + timedelta(days=1)
            cursor.execute(
                'UPDATE users SET night_mode_until = %s WHERE id = %s',
                (tomorrow_7am, user_id),
            )
        else:
            cursor.execute(
                'UPDATE users SET night_mode_until = NULL WHERE id = %s',
                (user_id,),
            )

        conn.commit()
        conn.close()

    @staticmethod
    def get_night_mode_status(user_id):
        """Recupere le statut du mode soiree"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT night_mode_until FROM users WHERE id = %s', (user_id,))
        result = cursor.fetchone()
        conn.close()

        if not result or not result['night_mode_until']:
            return False

        night_mode_until = result['night_mode_until']

        if datetime.now() > night_mode_until:
            Database.set_night_mode(user_id, False)
            return False

        return True

    @staticmethod
    def get_user_settings(user_id):
        """Recupere les reglages utilisateur."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            '''
            SELECT three_hour_threshold_liters,
                   weekly_drinking_days_threshold,
                   water_reminder_threshold_liters,
                   weight_kg,
                   sex,
                   beer_abv,
                   legal_bac_limit
            FROM users
            WHERE id = %s
            ''',
            (user_id,),
        )
        result = cursor.fetchone()
        conn.close()

        three_hour_threshold = result['three_hour_threshold_liters'] if result else None
        weekly_days_threshold = result['weekly_drinking_days_threshold'] if result else None
        water_reminder_threshold = result['water_reminder_threshold_liters'] if result else None
        weight_kg = result['weight_kg'] if result else None
        sex = result['sex'] if result else None
        beer_abv = result['beer_abv'] if result else None
        legal_bac_limit = result['legal_bac_limit'] if result else None
        # Ne retomber sur la valeur par defaut que si la colonne est NULL :
        # une valeur de 0 est valide et desactive l'alerte correspondante.
        if three_hour_threshold is None:
            three_hour_threshold = 1.5
        if weekly_days_threshold is None:
            weekly_days_threshold = 3
        if water_reminder_threshold is None:
            water_reminder_threshold = 1.0
        # Le degre est le seul reglage d'alcoolemie avec une valeur par defaut ;
        # poids et sexe restent NULL tant que l'utilisateur ne les renseigne pas.
        if beer_abv is None:
            beer_abv = 5.0
        if legal_bac_limit is None:
            legal_bac_limit = 0.5
        return {
            'three_hour_threshold_liters': float(three_hour_threshold),
            'weekly_drinking_days_threshold': int(weekly_days_threshold),
            'water_reminder_threshold_liters': float(water_reminder_threshold),
            'weight_kg': float(weight_kg) if weight_kg is not None else None,
            'sex': sex if sex in ('m', 'f') else None,
            'beer_abv': float(beer_abv),
            'legal_bac_limit': float(legal_bac_limit)
        }

    @staticmethod
    def update_user_settings(
        user_id,
        three_hour_threshold_liters,
        weekly_drinking_days_threshold,
        water_reminder_threshold_liters,
        weight_kg=None,
        sex=None,
        beer_abv=None,
        legal_bac_limit=None
    ):
        """Met a jour les reglages utilisateur."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            '''
            UPDATE users
            SET three_hour_threshold_liters = %s,
                weekly_drinking_days_threshold = %s,
                water_reminder_threshold_liters = %s,
                weight_kg = %s,
                sex = %s,
                beer_abv = %s,
                legal_bac_limit = %s
            WHERE id = %s
            ''',
            (
                three_hour_threshold_liters,
                weekly_drinking_days_threshold,
                water_reminder_threshold_liters,
                weight_kg,
                sex,
                beer_abv,
                legal_bac_limit,
                user_id,
            ),
        )
        conn.commit()
        conn.close()

    @staticmethod
    def get_record_evening_meta(user_id):
        """Recupere la soiree record nommee (date + nom optionnel)."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            '''
            SELECT DATE_FORMAT(record_evening_date, '%%Y-%%m-%%d') AS record_evening_date,
                   record_evening_name
            FROM users
            WHERE id = %s
            ''',
            (user_id,),
        )
        result = cursor.fetchone()
        conn.close()
        if not result:
            return {'date': None, 'name': None}
        return {
            'date': result['record_evening_date'],
            'name': result['record_evening_name'],
        }

    @staticmethod
    def set_record_evening_meta(user_id, record_date, name):
        """Met a jour la soiree record nommee (date de reference + nom)."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            '''
            UPDATE users
            SET record_evening_date = %s,
                record_evening_name = %s
            WHERE id = %s
            ''',
            (record_date, name, user_id),
        )
        conn.commit()
        conn.close()

    @staticmethod
    def record_login_attempt(username, success, ip_address, user_id=None):
        """Enregistre une tentative de connexion (succes ou echec)."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            '''
            INSERT INTO login_attempts (username, user_id, success, ip_address)
            VALUES (%s, %s, %s, %s)
            ''',
            (username, user_id, 1 if success else 0, ip_address),
        )
        conn.commit()
        conn.close()

    @staticmethod
    def get_failed_login_attempts(user_id, hours=24):
        """Compte les echecs de connexion pour un utilisateur sur les N dernieres heures."""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            '''
            SELECT COUNT(*) as failed_count
            FROM login_attempts
            WHERE user_id = %s
              AND success = 0
              AND attempted_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
            ''',
            (user_id, hours),
        )
        result = cursor.fetchone()
        conn.close()
        return result['failed_count'] if result else 0
