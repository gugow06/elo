FROM python:3.12-slim
WORKDIR /app
COPY area2-dados/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY area2-dados/pipeline pipeline
COPY area2-dados/sql sql
COPY area2-dados/tests tests
ENV PYTHONUNBUFFERED=1
# Gera o histórico fictício (só na primeira vez) e roda o pipeline a cada 15 minutos
CMD ["python", "-m", "pipeline.etl", "--gerar", "--loop", "900"]
