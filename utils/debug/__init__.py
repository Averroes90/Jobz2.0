"""
Debug snapshot utilities.

A portable, framework-agnostic debug logging system with pluggable
storage backends. Captures execution traces, LLM calls, and errors
for debugging and analysis.

Quick Start:
    from utils.debug import debug_snapshot

    with debug_snapshot("my_function") as dbg:
        dbg.log_input(x=10, y=20)
        result = x + y
        dbg.log_output(result=result)

Advanced Usage:
    from utils.debug import DebugSnapshot, FileStorage, MemoryStorage

    # Custom storage location
    storage = FileStorage(directory="custom/debug/path")
    with debug_snapshot("my_function", storage=storage) as dbg:
        # ... logging ...

    # In-memory storage for testing
    storage = MemoryStorage()
    with debug_snapshot("test_function", storage=storage) as dbg:
        # ... logging ...

    # Retrieve saved data
    data = storage.load("test_function")
"""

from .snapshot import DebugSnapshot, debug_snapshot
from .storage import StorageBackend, FileStorage, MemoryStorage
from .formatters import (
    format_as_json,
    format_as_pretty,
    format_llm_call,
    format_step,
    format_summary,
    format_error_list
)

__all__ = [
    # Core snapshot functionality
    "debug_snapshot",
    "DebugSnapshot",

    # Storage backends
    "StorageBackend",
    "FileStorage",
    "MemoryStorage",

    # Formatters
    "format_as_json",
    "format_as_pretty",
    "format_llm_call",
    "format_step",
    "format_summary",
    "format_error_list",
]

__version__ = "1.0.0"
