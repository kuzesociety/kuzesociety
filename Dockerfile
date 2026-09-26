# ---- 1. build the React frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Python API + model, serving the built frontend
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    KUZE_DATA_DIR=/data \
    KUZE_FRONTEND_DIR=/app/frontend/dist \
    OMP_NUM_THREADS=2
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist
# nflverse cache, SQLite database, trained models: keep them on a volume
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "kuze.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
