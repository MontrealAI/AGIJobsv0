FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && rm -rf /root/.cache/pip

COPY pyproject.toml README.md ./
COPY src ./src
COPY config.example.yaml ./config.example.yaml
COPY web ./web

RUN pip install -e .

EXPOSE 8080 9109

ENTRYPOINT ["agi-alpha-node"]
CMD ["run", "config.example.yaml", "--serve-dashboard", "--cycles", "1"]
