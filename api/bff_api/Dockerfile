# syntax=docker/dockerfile:1.7
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
ENV PIP_ONLY_BINARY=:all: PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY marketsim ./marketsim
COPY api/bff_api ./api/bff_api

RUN python -m pip install --upgrade pip \
 && python -m pip install ".[bff]"

EXPOSE 8100
CMD ["uvicorn", "api.bff_api.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1", "--log-level", "warning", "--no-access-log"]
