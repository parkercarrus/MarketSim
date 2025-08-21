# syntax=docker/dockerfile:1
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./

COPY marketsim ./marketsim
COPY api ./api

RUN pip install --upgrade pip && pip install ".[api]"

CMD ["uvicorn", "api.sim_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
