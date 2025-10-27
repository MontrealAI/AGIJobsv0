# syntax=docker/dockerfile:1

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_HOME=/opt/agi-agent

WORKDIR ${APP_HOME}

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY requirements-agent.txt ${APP_HOME}/requirements-agent.txt
RUN pip install --no-cache-dir -r requirements-agent.txt

COPY tools/agent_registry_cli.py ${APP_HOME}/agent_registry_cli.py
COPY orchestrator ${APP_HOME}/orchestrator

COPY agent-gateway ${APP_HOME}/agent-gateway

ENV AGENT_ID=agent-001 \
    AGENT_REGION=us-east \
    AGENT_CAPABILITIES=execution,validation \
    AGENT_ROUTER=default \
    AGENT_REGISTRY_URL=http://meta-api:8000/agents \
    AGENT_REGISTRY_OWNER_TOKEN=changeme \
    AGENT_HEARTBEAT_SECRET=please-change-me

COPY deploy/docker/entrypoints/agent-node.sh /usr/local/bin/agent-node
RUN chmod +x /usr/local/bin/agent-node

ENTRYPOINT ["agent-node"]
