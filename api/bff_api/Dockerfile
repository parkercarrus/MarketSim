# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY marketsim ./marketsim
COPY api/bff_api ./api/bff_api

RUN pip install --upgrade pip && pip install ".[api]"

EXPOSE 8001
CMD ["uvicorn", "api.bff_api.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
