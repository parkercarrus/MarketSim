# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
# Prefer binary wheels; fail if a package needs building
ENV PIP_ONLY_BINARY=:all: PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY marketsim ./marketsim
COPY api/sim_api ./api/sim_api

RUN python -m pip install --upgrade pip \
 && python -m pip install ".[api]"

EXPOSE 8000
CMD ["uvicorn", "api.sim_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
