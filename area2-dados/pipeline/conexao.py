"""Conexão com o PostgreSQL do ELO a partir de DATABASE_URL."""
from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

PADRAO = "postgresql://elo:elo_dev_local@localhost:5432/elo"


def url_banco() -> str:
    url = os.environ.get("DATABASE_URL", PADRAO)
    # SQLAlchemy precisa do driver explícito
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def motor() -> Engine:
    return create_engine(url_banco(), future=True)
