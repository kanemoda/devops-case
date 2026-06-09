import json
import logging
import os
import sys
from datetime import datetime, timezone

import requests

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("etl")

API_URL = os.environ.get("API_URL", "https://api.github.com")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/tmp/etl")
HTTP_TIMEOUT = int(os.environ.get("HTTP_TIMEOUT", "10"))


def extract():
    log.info("fetching %s", API_URL)
    response = requests.get(API_URL, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    return response.json()


def transform(payload):
    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": API_URL,
        "endpoint_count": len(payload),
        "payload": payload,
    }


def load(record):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, "github.json")
    with open(path, "w") as handle:
        json.dump(record, handle, indent=2)
    log.info("loaded %d endpoints into %s", record["endpoint_count"], path)


def main():
    try:
        record = transform(extract())
        load(record)
    except requests.RequestException as exc:
        log.error("ETL run failed: %s", exc)
        return 1
    log.info("ETL run finished successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main())
