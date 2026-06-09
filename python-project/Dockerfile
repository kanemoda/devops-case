FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ETL.py ./

RUN useradd --create-home --uid 1000 appuser
USER appuser

CMD ["python", "ETL.py"]
