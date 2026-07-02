FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOMENET_DB_FILE=/data/homenet.db \
    HOMENET_DATA_FILE=/data/devices.json \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# iputils-ping: the collector's ICMP fallback shells out to `ping` for devices
# with no open TCP ports (IoT sensors, smart plugs). python:slim ships without
# it, so without this the fallback silently fails and those devices read offline.
RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Install uv from the official image (fast, no pip needed).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install dependencies first (leverages Docker layer caching).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code.
COPY app ./app

# Run as a non-root user so the bind-mounted /data volume is owned by UID 1000,
# matching a typical Linux desktop user and allowing hand-editing without sudo.
RUN groupadd -r homenet && useradd -r -g homenet -u 1000 homenet \
    && mkdir -p /data /home/homenet \
    && chown homenet:homenet /data /home/homenet
USER homenet

# Runtime data lives on a mounted volume; seeded on first start.
VOLUME ["/data"]
EXPOSE 8000

# /api/ready (not /api/health): health stays 200 even when the database is
# corrupt (it's a pure liveness check), so it would never fail this probe.
# ready fails 503 when the database can't be read, which is what should mark
# the container unhealthy (and gate the frontend's depends_on: service_healthy
# in docker-compose.yml).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/ready').status==200 else 1)"

# --timeout-graceful-shutdown: let an in-flight reachability sweep finish on
# `docker stop` instead of being SIGKILLed at the 10s default (#89).
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--timeout-graceful-shutdown", "10"]
