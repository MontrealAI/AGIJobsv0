FROM python:3.11-slim

WORKDIR /opt/agi-alpha-node

COPY src ./src
COPY config ./config
COPY web ./web
COPY README.md ./README.md

ENV PYTHONPATH=/opt/agi-alpha-node/src

# Some supported architectures need to compile transitive Python extensions.
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir web3==6.10.0 \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["python", "src/agi_alpha_node_demo/cli.py"]
CMD ["--config", "config/default.toml", "run", "--serve-dashboard"]
