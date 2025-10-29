FROM python:3.11-slim

WORKDIR /app
COPY . /app

RUN useradd -m agi && chown -R agi /app
USER agi

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "alpha_node.cli", "run"]
