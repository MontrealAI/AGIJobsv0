FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
ENV PYTHONPATH=/app/src
EXPOSE 9404
CMD ["python", "-m", "agi_alpha_node_demo.cli", "run"]
