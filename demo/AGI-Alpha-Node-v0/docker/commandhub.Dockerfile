FROM python:3.11-slim
WORKDIR /app
COPY alpha_node ./alpha_node
COPY config.toml ens_registry.csv jobs.json knowledge.json ./
COPY dashboard ./dashboard
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python", "-m", "alpha_node.cli"]
CMD ["--config", "config.toml", "run"]
