FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOME=/opt/agi-alpha-node

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR ${APP_HOME}

COPY requirements-demo.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-demo.txt

COPY agi_alpha_node_demo ./agi_alpha_node_demo
COPY config.example.yaml ./config.example.yaml
COPY web ./web
COPY scripts ./scripts

EXPOSE 9700 9701

ENTRYPOINT ["python", "-m", "agi_alpha_node_demo.cli", "console", "--config", "./config.example.yaml"]
