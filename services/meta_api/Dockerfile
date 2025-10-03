FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus

WORKDIR /app

COPY services/meta_api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app

RUN mkdir -p /data/orchestrator /tmp/prometheus

EXPOSE 8000

CMD ["uvicorn", "services.meta_api.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
