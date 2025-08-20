FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir "setuptools>=69" "wheel"
COPY marketsim ./marketsim
RUN pip install --no-cache-dir fastapi uvicorn[standard] orjson pydantic pydantic-settings && pip install -e .
COPY api/sim_api ./api/sim_api
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "api.sim_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
