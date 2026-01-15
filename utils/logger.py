import json
from datetime import datetime
from pathlib import Path

class PrettyLogger:
    def __init__(self, log_dir: str = "logs", filename: str = "debug.log"):
        self.log_path = Path(log_dir) / filename
        self.log_path.parent.mkdir(exist_ok=True)

    def log(self, label: str, data: any):
        with open(self.log_path, "a") as f:
            f.write(f"\n{'─'*60}\n")
            f.write(f"⏱  {datetime.now().strftime('%H:%M:%S')}  │  {label}\n")
            f.write(f"{'─'*60}\n\n")

            if isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, str) and len(value) > 100:
                        # Long text gets its own block
                        f.write(f"📌 {key}:\n\n{value}\n\n")
                    else:
                        f.write(f"• {key}: {value}\n")
            else:
                f.write(f"{data}\n")

            f.write("\n")

    def clear(self):
        self.log_path.write_text("")
