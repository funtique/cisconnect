FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY src/ /app/src/
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN pip install --no-cache-dir \
    discord.py==2.4.0 \
    aiohttp==3.10.5 \
    feedparser==6.0.11 \
    SQLModel==0.0.22 aiosqlite==0.20.0 \
    pydantic-settings==2.4.0 \
    apscheduler==3.10.4 \
    structlog==24.1.0 \
    python-dotenv==1.0.0

VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]