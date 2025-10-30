FROM python:3.11-slim

WORKDIR /opt/agi-alpha-node

COPY src ./src
COPY config ./config
COPY web ./web
COPY README.md ./README.md

ENV PYTHONPATH=/opt/agi-alpha-node/src

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir web3==6.10.0

ENTRYPOINT ["python", "src/agi_alpha_node_demo/cli.py"]
CMD ["--config", "config/default.toml", "run", "--serve-dashboard"]
