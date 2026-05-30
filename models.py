import os
from datetime import datetime, timedelta
import uuid

import pymysql
from pymysql.cursors import DictCursor

DB_HOST = os.environ.get('DB_HOST', 'mariadb')
DB_PORT = int(os.environ.get('DB_PORT', '3306'))
DB_NAME = os.environ.get('DB_NAME', 'beertracker')
DB_USER = os.environ.get('DB_USER', 'beertracker')
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
                force_password_change TINYINT(1) DEFAULT 0
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
    def get_all_users():
        """Obtenir tous les utilisateurs"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, username, created_at FROM users WHERE is_admin = 0 ORDER BY username'
        )
        users = cursor.fetchall()
        conn.close()
        return users

    @staticmethod
    def add_consumption(user_id, date, pints=0, half_pints=0, liters_33=0, time='00:00:00'):
        """Ajouter une consommation avec heure (AJOUTER, non remplacer)"""
        conn = Database.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            'SELECT pints, half_pints, liters_33 FROM consumption WHERE user_id = %s AND date = %s AND time = %s',
            (user_id, date, time),
        )
        existing = cursor.fetchone()

        if existing:
            new_pints = (existing['pints'] or 0) + pints
            new_half_pints = (existing['half_pints'] or 0) + half_pints
            new_liters_33 = (existing['liters_33'] or 0) + liters_33

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
                (user_id, date, time, pints, half_pints, liters_33),
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
