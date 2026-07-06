"""Configuration Gunicorn pour la production.

Les paramètres sont surchargeables via variables d'environnement afin de
pouvoir ajuster le dimensionnement sans reconstruire l'image.
"""
import os

# Port aligné sur APP_PORT (cohérent avec le mapping docker-compose et EXPOSE).
bind = f"0.0.0.0:{os.environ.get('APP_PORT', '8080')}"

# Règle usuelle : (2 x cœurs) + 1. Ajustable selon la machine.
workers = int(os.environ.get('GUNICORN_WORKERS', '3'))
threads = int(os.environ.get('GUNICORN_THREADS', '2'))

# Coupe les requêtes qui traînent trop longtemps.
timeout = int(os.environ.get('GUNICORN_TIMEOUT', '60'))
graceful_timeout = int(os.environ.get('GUNICORN_GRACEFUL_TIMEOUT', '30'))

# Recycle les workers régulièrement pour limiter les fuites mémoire éventuelles.
max_requests = int(os.environ.get('GUNICORN_MAX_REQUESTS', '1000'))
max_requests_jitter = int(os.environ.get('GUNICORN_MAX_REQUESTS_JITTER', '100'))

# Logs sur stdout/stderr (récupérables via `docker logs`).
accesslog = '-'
errorlog = '-'
loglevel = os.environ.get('GUNICORN_LOGLEVEL', 'info')

# Requêtes derrière le tunnel Cloudflare : on fait confiance à l'IP du proxy local.
forwarded_allow_ips = os.environ.get('GUNICORN_FORWARDED_ALLOW_IPS', '*')
