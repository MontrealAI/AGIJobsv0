FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOME=/opt/agi-alpha-node \
    PATH="/opt/agi-alpha-node/.venv/bin:$PATH"

WORKDIR ${APP_HOME}

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m venv .venv && \
    .venv/bin/pip install --upgrade pip && \
    .venv/bin/pip install -r requirements.txt

COPY src ./src
COPY config ./config
COPY web ./web
COPY scripts ./scripts

EXPOSE 8055 9095

ENTRYPOINT ["python", "-m", "agi_alpha_node", "run", "--config", "config/operator.example.yaml"]
