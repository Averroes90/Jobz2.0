"""Token usage tracker for monitoring API calls and costs."""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional
from .logger import PrettyLogger


class TokenTracker:
    """Tracks token usage and costs for API calls."""

    # Pricing per 1M tokens
    PRICING = {
        "haiku": {"input": 1.00, "output": 5.00},
        "sonnet": {"input": 3.00, "output": 15.00},
        "opus": {"input": 15.00, "output": 75.00}
    }

    def __init__(self, log_file: Optional[str] = None):
        """Initialize tracker.

        Args:
            log_file: Optional filename for persistent logging (in logs/ directory)
        """
        self.calls = []
        self.logger = PrettyLogger(filename=log_file or "token_usage.log")

    def log_call(
        self,
        task_name: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        metadata: Optional[dict] = None
    ):
        """Record a single API call.

        Args:
            task_name: Name of the task (e.g., "field_matching", "cover_letter")
            model: Model used (e.g., "haiku", "sonnet", "opus")
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            metadata: Optional additional data to store
        """
        # Normalize model name
        model_lower = model.lower()
        for key in self.PRICING:
            if key in model_lower:
                model_key = key
                break
        else:
            model_key = "sonnet"  # Default to sonnet if unknown

        # Calculate cost
        pricing = self.PRICING[model_key]
        cost_estimate = (
            (input_tokens / 1_000_000) * pricing["input"] +
            (output_tokens / 1_000_000) * pricing["output"]
        )

        # Create call record
        call_record = {
            "timestamp": datetime.utcnow().isoformat(),
            "task_name": task_name,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "cost_estimate": round(cost_estimate, 6),
            "metadata": metadata or {}
        }

        # Store in memory
        self.calls.append(call_record)

        # Log using PrettyLogger
        try:
            log_data = {
                "task": task_name,
                "model": model_key,
                "tokens_in": f"{input_tokens:,}",
                "tokens_out": f"{output_tokens:,}",
                "total": f"{input_tokens + output_tokens:,}",
                "cost": f"${cost_estimate:.6f}"
            }
            if metadata:
                log_data["metadata"] = str(metadata)

            self.logger.log(f"API_CALL", log_data)
        except Exception as e:
            print(f"Warning: Could not write to log file: {e}")

    def get_summary(self) -> dict:
        """Get summary statistics grouped by task and model.

        Returns:
            Dict with totals by task_name and model
        """
        summary = {}

        for call in self.calls:
            task = call["task_name"]
            model = call["model"]
            key = f"{task}:{model}"

            if key not in summary:
                summary[key] = {
                    "task_name": task,
                    "model": model,
                    "call_count": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "cost_estimate": 0.0
                }

            summary[key]["call_count"] += 1
            summary[key]["input_tokens"] += call["input_tokens"]
            summary[key]["output_tokens"] += call["output_tokens"]
            summary[key]["total_tokens"] += call["total_tokens"]
            summary[key]["cost_estimate"] += call["cost_estimate"]

        # Round costs
        for key in summary:
            summary[key]["cost_estimate"] = round(summary[key]["cost_estimate"], 6)

        return summary

    def get_session_total(self) -> dict:
        """Get total tokens and cost for current session.

        Returns:
            Dict with total_input_tokens, total_output_tokens, total_tokens, total_cost
        """
        total_input = sum(call["input_tokens"] for call in self.calls)
        total_output = sum(call["output_tokens"] for call in self.calls)
        total_cost = sum(call["cost_estimate"] for call in self.calls)

        return {
            "call_count": len(self.calls),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_tokens": total_input + total_output,
            "total_cost": round(total_cost, 6)
        }

    def export_log(self, filepath: str):
        """Save session summary to pretty log file.

        Args:
            filepath: Path to output log file (will use PrettyLogger format)
        """
        # Create a temporary logger for the export
        log_dir = os.path.dirname(filepath)
        filename = os.path.basename(filepath)
        export_logger = PrettyLogger(log_dir=log_dir, filename=filename)

        # Export session summary
        session = self.get_session_total()
        export_logger.log("SESSION_SUMMARY", {
            "call_count": session['call_count'],
            "total_tokens": f"{session['total_tokens']:,}",
            "input_tokens": f"{session['total_input_tokens']:,}",
            "output_tokens": f"{session['total_output_tokens']:,}",
            "total_cost": f"${session['total_cost']:.6f}",
            "exported_at": datetime.utcnow().isoformat()
        })

        # Export task/model summary
        summary = self.get_summary()
        if summary:
            for key, data in sorted(summary.items()):
                export_logger.log("TASK_SUMMARY", {
                    "task": data['task_name'],
                    "model": data['model'],
                    "calls": data['call_count'],
                    "tokens_in": f"{data['input_tokens']:,}",
                    "tokens_out": f"{data['output_tokens']:,}",
                    "total": f"{data['total_tokens']:,}",
                    "cost": f"${data['cost_estimate']:.6f}"
                })

        print(f"Token log exported to {filepath}")

    def print_summary(self):
        """Print a human-readable summary to console."""
        summary = self.get_summary()
        session = self.get_session_total()

        print("\n" + "="*70)
        print("TOKEN USAGE SUMMARY")
        print("="*70)

        if not summary:
            print("No API calls recorded.")
            return

        print(f"\n{'Task:Model':<30} {'Calls':<8} {'In Tokens':<12} {'Out Tokens':<12} {'Cost':<10}")
        print("-"*70)

        for key, data in sorted(summary.items()):
            task_model = f"{data['task_name']}:{data['model']}"
            print(
                f"{task_model:<30} "
                f"{data['call_count']:<8} "
                f"{data['input_tokens']:<12,} "
                f"{data['output_tokens']:<12,} "
                f"${data['cost_estimate']:<9.4f}"
            )

        print("-"*70)
        print(
            f"{'TOTAL':<30} "
            f"{session['call_count']:<8} "
            f"{session['total_input_tokens']:<12,} "
            f"{session['total_output_tokens']:<12,} "
            f"${session['total_cost']:<9.4f}"
        )
        print("="*70 + "\n")


# Global tracker instance
_global_tracker = None

def get_tracker() -> TokenTracker:
    """Get or create the global token tracker instance."""
    global _global_tracker
    if _global_tracker is None:
        _global_tracker = TokenTracker()
    return _global_tracker


def track_api_call(tracker: TokenTracker, task_name: str, model: str, response) -> None:
    """Extract usage from Anthropic response and log it.

    Args:
        tracker: TokenTracker instance
        task_name: Name of the task (e.g., "field_matching", "cover_letter")
        model: Model identifier
        response: Anthropic API response object with usage attribute
    """
    tracker.log_call(
        task_name=task_name,
        model=model,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens
    )
