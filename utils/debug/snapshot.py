"""
Core debug snapshot context manager.

Provides a context manager for capturing debug information during
function execution. Automatically tracks timing, inputs, outputs,
intermediate steps, LLM calls, and errors.
"""

import time
from datetime import datetime
from typing import Any, Optional, Dict, List
from .storage import StorageBackend, FileStorage


class DebugSnapshot:
    """
    Context manager for capturing debug snapshots.

    Usage:
        with debug_snapshot("validate_company_name") as dbg:
            dbg.log_input(url_company="ridezum", context={...})

            # ... do work ...
            dbg.log_step("extract_from_context", headings=[...])

            # ... call LLM ...
            dbg.log_llm_call(prompt="...", response="Zūm", model="haiku")

            dbg.log_decision(result="Zūm", success=True, reason="Found in nav")
            dbg.log_output(validated_name="Zūm")

    The snapshot is automatically saved when exiting the context.
    """

    def __init__(
        self,
        name: str,
        storage: Optional[StorageBackend] = None,
        enabled: bool = True,
        auto_save: bool = True
    ):
        """
        Initialize debug snapshot.

        Args:
            name: Snapshot name (e.g., "validate_company_name")
            storage: Storage backend (defaults to FileStorage)
            enabled: If False, all operations are no-ops
            auto_save: If True, automatically save on __exit__
        """
        self.name = name
        self.storage = storage or FileStorage()
        self.enabled = enabled
        self.auto_save = auto_save

        # Snapshot data structure
        self.data = {
            "name": name,
            "timestamp": None,
            "start_time": None,
            "end_time": None,
            "duration_ms": None,
            "inputs": {},
            "outputs": {},
            "steps": [],
            "llm_calls": [],
            "errors": [],
        }

        # Internal state
        self._start_time_ns = None
        self._saved = False

    def __enter__(self):
        """Enter context manager."""
        if self.enabled:
            self._start_time_ns = time.perf_counter_ns()
            self.data["timestamp"] = datetime.now().isoformat()
            self.data["start_time"] = datetime.now().isoformat()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager and auto-save if enabled."""
        if self.enabled:
            # Record end time and duration
            end_time_ns = time.perf_counter_ns()
            self.data["end_time"] = datetime.now().isoformat()
            self.data["duration_ms"] = (end_time_ns - self._start_time_ns) / 1_000_000

            # Log exception if one occurred
            if exc_type is not None:
                self.log_error(
                    error_type=exc_type.__name__,
                    message=str(exc_val),
                    traceback=True
                )

            # Auto-save unless already saved
            if self.auto_save and not self._saved:
                self.save()

        # Don't suppress exceptions
        return False

    def log_input(self, **kwargs):
        """
        Log input parameters.

        Args:
            **kwargs: Input parameters as key-value pairs
        """
        if self.enabled:
            self.data["inputs"].update(kwargs)

    def log_output(self, **kwargs):
        """
        Log output values.

        Args:
            **kwargs: Output values as key-value pairs
        """
        if self.enabled:
            self.data["outputs"].update(kwargs)

    def log_step(self, step_name: str, **details):
        """
        Log an intermediate step.

        Args:
            step_name: Name of the step (e.g., "extract_from_headings")
            **details: Additional details about the step
        """
        if self.enabled:
            step_data = {
                "name": step_name,
                "timestamp": datetime.now().isoformat(),
                **details
            }
            self.data["steps"].append(step_data)

    def log_llm_call(
        self,
        prompt: str,
        response: str,
        model: Optional[str] = None,
        tokens_in: Optional[int] = None,
        tokens_out: Optional[int] = None,
        **extra
    ):
        """
        Log an LLM API call.

        Args:
            prompt: The prompt sent to the LLM
            response: The response received from the LLM
            model: Model identifier (e.g., "claude-haiku-4-5")
            tokens_in: Input token count
            tokens_out: Output token count
            **extra: Additional metadata (temperature, top_p, etc.)
        """
        if self.enabled:
            call_data = {
                "timestamp": datetime.now().isoformat(),
                "prompt": prompt,
                "response": response,
                "model": model,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                **extra
            }
            self.data["llm_calls"].append(call_data)

    def log_decision(
        self,
        result: Any,
        success: bool,
        reason: str = "",
        **extra
    ):
        """
        Log a final decision or result.

        Args:
            result: The decision/result value
            success: Whether the operation succeeded
            reason: Explanation of the decision
            **extra: Additional decision metadata
        """
        if self.enabled:
            self.data["outputs"]["decision"] = {
                "result": result,
                "success": success,
                "reason": reason,
                **extra
            }

    def log_error(
        self,
        error_type: str,
        message: str,
        traceback: bool = False,
        **extra
    ):
        """
        Log an error.

        Args:
            error_type: Type of error (e.g., "ValueError", "APIError")
            message: Error message
            traceback: Whether to include traceback (not implemented yet)
            **extra: Additional error metadata
        """
        if self.enabled:
            error_data = {
                "timestamp": datetime.now().isoformat(),
                "type": error_type,
                "message": message,
                **extra
            }
            self.data["errors"].append(error_data)

    def save(self, name: Optional[str] = None) -> Optional[str]:
        """
        Manually save the snapshot.

        Args:
            name: Override snapshot name (defaults to self.name)

        Returns:
            Path or identifier of saved snapshot, or None if disabled
        """
        if not self.enabled:
            return None

        snapshot_name = name or self.name
        path = self.storage.save(snapshot_name, self.data)
        self._saved = True
        return path

    def get_data(self) -> Dict:
        """
        Get the current snapshot data.

        Returns:
            Snapshot data dictionary
        """
        return self.data.copy() if self.enabled else {}


def debug_snapshot(
    name: str,
    storage: Optional[StorageBackend] = None,
    enabled: bool = True
) -> DebugSnapshot:
    """
    Create a debug snapshot context manager.

    Convenience function for creating DebugSnapshot instances.

    Args:
        name: Snapshot name
        storage: Storage backend (defaults to FileStorage)
        enabled: If False, all operations are no-ops

    Returns:
        DebugSnapshot context manager

    Example:
        with debug_snapshot("my_function") as dbg:
            dbg.log_input(x=10, y=20)
            result = x + y
            dbg.log_output(result=result)
    """
    return DebugSnapshot(name=name, storage=storage, enabled=enabled)
