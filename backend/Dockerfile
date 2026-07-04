FROM python:3.13-slim-bookworm

ENV PYTHONUNBUFFERED=1
ENV UV_PROJECT_ENVIRONMENT=/.venv

WORKDIR /app

COPY pyproject.toml uv.lock ./

# Install psql
RUN apt-get update && apt-get install -y --no-install-recommends \
      postgresql-client \
      libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv && \
    uv venv && \
    uv sync

EXPOSE 8000
