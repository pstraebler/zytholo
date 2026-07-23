FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod -R 775 /app && \
    chgrp -R 0 /app

USER 1001

EXPOSE 8080

# Sonde applicative : /healthz vérifie aussi la connexion à la base.
# urllib plutôt que curl, absent de l'image slim. Port lu dans le conteneur
# pour rester aligné sur le bind gunicorn si APP_PORT change.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('APP_PORT', '8080') + '/healthz', timeout=3)"]

CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
