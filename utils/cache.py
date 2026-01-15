import json
import hashlib
from datetime import datetime, timedelta
from pathlib import Path

class ResearchCache:
    def __init__(self, cache_dir: str = "cache", max_age_days: int = 7):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        self.max_age = timedelta(days=max_age_days)

    def _get_path(self, company_name: str) -> Path:
        # Sanitize company name for filename
        safe_name = "".join(c if c.isalnum() else "_" for c in company_name.lower())
        return self.cache_dir / f"{safe_name}.json"

    def get(self, company_name: str) -> dict | None:
        path = self._get_path(company_name)
        if not path.exists():
            return None

        data = json.loads(path.read_text())
        cached_time = datetime.fromisoformat(data["timestamp"])

        if datetime.now() - cached_time > self.max_age:
            return None  # Expired

        return data["content"]

    def set(self, company_name: str, content: dict):
        path = self._get_path(company_name)
        data = {
            "timestamp": datetime.now().isoformat(),
            "company_name": company_name,
            "content": content
        }
        path.write_text(json.dumps(data, indent=2))
