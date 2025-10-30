FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    AGI_ALPHA_NODE_HOME=/opt/agi-alpha-node

WORKDIR ${AGI_ALPHA_NODE_HOME}

COPY requirements.txt ./
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl git && \
    pip install --upgrade pip && \
    pip install -r requirements.txt && \
    apt-get purge -y build-essential && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 8080 9310

ENTRYPOINT ["python", "-m", "agi_alpha_node_demo", "run"]
