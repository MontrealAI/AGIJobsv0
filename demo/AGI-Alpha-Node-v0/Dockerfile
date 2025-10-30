FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    POETRY_VERSION=1.8.3

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY agi_alpha_node ./agi_alpha_node
COPY tests ./tests
COPY README.md ./README.md

CMD ["python", "-m", "agi_alpha_node", "run-demo"]
