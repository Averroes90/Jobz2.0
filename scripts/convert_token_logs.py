#!/usr/bin/env python3
"""Convert existing JSON/JSONL token logs to new PrettyLogger format."""

import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path to import utils
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.logger import PrettyLogger


def convert_jsonl_file(jsonl_path: Path, output_logger: PrettyLogger):
    """Convert a JSONL file to the new format."""
    print(f"Converting {jsonl_path.name}...")

    with open(jsonl_path, 'r') as f:
        for line in f:
            if not line.strip():
                continue

            try:
                record = json.loads(line)

                # Extract model type from full model name
                model_name = record.get('model', '')
                if 'haiku' in model_name.lower():
                    model_key = 'haiku'
                elif 'sonnet' in model_name.lower():
                    model_key = 'sonnet'
                elif 'opus' in model_name.lower():
                    model_key = 'opus'
                else:
                    model_key = 'unknown'

                log_data = {
                    "task": record['task_name'],
                    "model": model_key,
                    "tokens_in": f"{record['input_tokens']:,}",
                    "tokens_out": f"{record['output_tokens']:,}",
                    "total": f"{record['total_tokens']:,}",
                    "cost": f"${record['cost_estimate']:.6f}",
                    "timestamp": record['timestamp']
                }

                if record.get('metadata'):
                    log_data['metadata'] = str(record['metadata'])

                output_logger.log("API_CALL", log_data)

            except Exception as e:
                print(f"  Error processing line: {e}")


def convert_json_export(json_path: Path, output_logger: PrettyLogger):
    """Convert a JSON export file to the new format."""
    print(f"Converting {json_path.name}...")

    with open(json_path, 'r') as f:
        data = json.load(f)

    # Log the session summary first
    if 'session_total' in data:
        total = data['session_total']
        output_logger.log("SESSION_SUMMARY", {
            "call_count": total['call_count'],
            "total_tokens": f"{total['total_tokens']:,}",
            "input_tokens": f"{total['total_input_tokens']:,}",
            "output_tokens": f"{total['total_output_tokens']:,}",
            "total_cost": f"${total['total_cost']:.6f}",
            "exported_at": data.get('exported_at', 'unknown')
        })

    # Log individual calls
    if 'calls' in data:
        for record in data['calls']:
            # Extract model type from full model name
            model_name = record.get('model', '')
            if 'haiku' in model_name.lower():
                model_key = 'haiku'
            elif 'sonnet' in model_name.lower():
                model_key = 'sonnet'
            elif 'opus' in model_name.lower():
                model_key = 'opus'
            else:
                model_key = 'unknown'

            log_data = {
                "task": record['task_name'],
                "model": model_key,
                "tokens_in": f"{record['input_tokens']:,}",
                "tokens_out": f"{record['output_tokens']:,}",
                "total": f"{record['total_tokens']:,}",
                "cost": f"${record['cost_estimate']:.6f}",
                "timestamp": record['timestamp']
            }

            if record.get('metadata'):
                log_data['metadata'] = str(record['metadata'])

            output_logger.log("API_CALL", log_data)


def main():
    """Convert all existing token logs to new format."""
    logs_dir = Path(__file__).parent.parent / "logs"

    if not logs_dir.exists():
        print("No logs directory found.")
        return

    # Create output logger for converted logs
    output_logger = PrettyLogger(filename="token_usage_converted.log")

    # Clear existing output file
    output_logger.clear()

    print("Converting token usage logs to new format...")
    print(f"Output: {output_logger.log_path}\n")

    # Find all JSONL and JSON token logs
    jsonl_files = list(logs_dir.glob("token_usage*.jsonl"))
    json_files = list(logs_dir.glob("*token_usage*.json"))

    # Convert JSONL files
    for jsonl_file in sorted(jsonl_files):
        convert_jsonl_file(jsonl_file, output_logger)

    # Convert JSON export files
    for json_file in sorted(json_files):
        convert_json_export(json_file, output_logger)

    print(f"\n✅ Conversion complete!")
    print(f"   Output: {output_logger.log_path}")
    print(f"   Processed: {len(jsonl_files)} JSONL files, {len(json_files)} JSON files")


if __name__ == "__main__":
    main()
