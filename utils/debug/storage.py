"""
Storage backends for debug snapshots.

Provides pluggable storage backends for saving debug snapshots.
Default backend writes to filesystem with automatic rotation.
"""

import json
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Optional, List


class StorageBackend(ABC):
    """Abstract base class for storage backends."""

    @abstractmethod
    def save(self, name: str, data: dict) -> str:
        """
        Save a debug snapshot.

        Args:
            name: Snapshot name (e.g., "validate_company_name")
            data: Snapshot data dictionary

        Returns:
            Identifier or path to saved snapshot
        """
        pass

    @abstractmethod
    def load(self, name: str) -> Optional[dict]:
        """
        Load the most recent snapshot with given name.

        Args:
            name: Snapshot name

        Returns:
            Snapshot data dictionary or None if not found
        """
        pass

    @abstractmethod
    def list(self, pattern: Optional[str] = None) -> List[str]:
        """
        List available snapshots.

        Args:
            pattern: Optional glob pattern to filter snapshots

        Returns:
            List of snapshot names/identifiers
        """
        pass


class FileStorage(StorageBackend):
    """
    Filesystem-based storage backend.

    Writes snapshots to individual JSON files with timestamps.
    Supports automatic rotation to prevent disk space issues.
    """

    def __init__(
        self,
        directory: str = "logs/debug",
        rotation: bool = True,
        max_files: int = 100,
        format: str = "json"
    ):
        """
        Initialize file storage.

        Args:
            directory: Directory to store snapshot files
            rotation: Enable automatic file rotation
            max_files: Maximum files to keep per snapshot name
            format: Output format ("json" or "pretty")
        """
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.rotation = rotation
        self.max_files = max_files
        self.format = format

    def save(self, name: str, data: dict) -> str:
        """
        Save snapshot to filesystem.

        Creates filename with timestamp: {name}_{timestamp}.json
        Automatically rotates old files if enabled.

        Args:
            name: Snapshot name
            data: Snapshot data

        Returns:
            Path to saved file
        """
        # Generate timestamped filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
        filename = f"{name}_{timestamp}.json"
        filepath = self.directory / filename

        # Write snapshot
        if self.format == "json":
            filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        elif self.format == "pretty":
            self._write_pretty(filepath, data)
        else:
            raise ValueError(f"Unknown format: {self.format}")

        # Rotate old files if enabled
        if self.rotation:
            self._rotate_files(name)

        return str(filepath)

    def load(self, name: str) -> Optional[dict]:
        """
        Load most recent snapshot with given name.

        Args:
            name: Snapshot name

        Returns:
            Snapshot data or None if not found
        """
        # Find all matching files
        files = sorted(self.directory.glob(f"{name}_*.json"))
        if not files:
            return None

        # Load most recent
        latest = files[-1]
        return json.loads(latest.read_text())

    def list(self, pattern: Optional[str] = None) -> List[str]:
        """
        List all snapshot files.

        Args:
            pattern: Optional glob pattern (e.g., "validate_*")

        Returns:
            List of snapshot file paths
        """
        glob_pattern = f"{pattern}_*.json" if pattern else "*.json"
        return [str(f) for f in sorted(self.directory.glob(glob_pattern))]

    def _write_pretty(self, filepath: Path, data: dict):
        """Write snapshot in human-readable format."""
        with open(filepath, "w", encoding="utf-8") as f:
            # Header
            f.write(f"{'='*60}\n")
            f.write(f"{data['name']} - {data['timestamp']}\n")
            if data.get('duration_ms'):
                f.write(f"Duration: {data['duration_ms']:.2f}ms\n")
            f.write(f"{'='*60}\n\n")

            # Inputs
            if data.get('inputs'):
                f.write("INPUTS:\n")
                for key, val in data['inputs'].items():
                    if isinstance(val, str) and len(val) > 100:
                        f.write(f"\n📌 {key}:\n{val}\n\n")
                    else:
                        f.write(f"• {key}: {json.dumps(val, ensure_ascii=False)}\n")
                f.write("\n")

            # Steps
            if data.get('steps'):
                f.write("STEPS:\n")
                for step in data['steps']:
                    f.write(f"→ {step['name']} ({step['timestamp']})\n")
                    for key, val in step.items():
                        if key not in ['name', 'timestamp']:
                            f.write(f"  • {key}: {json.dumps(val, ensure_ascii=False)}\n")
                f.write("\n")

            # LLM Calls
            if data.get('llm_calls'):
                f.write("LLM CALLS:\n")
                for i, call in enumerate(data['llm_calls'], 1):
                    f.write(f"\n{'='*60}\n")
                    f.write(f"Call #{i} - {call.get('model', 'unknown')} ({call['timestamp']})\n")
                    f.write(f"{'='*60}\n\n")
                    f.write(f"PROMPT:\n{call['prompt']}\n\n")
                    f.write(f"RESPONSE:\n{call['response']}\n\n")
                    if call.get('tokens_in') or call.get('tokens_out'):
                        f.write(f"Tokens: {call.get('tokens_in', 0)} in, {call.get('tokens_out', 0)} out\n\n")

            # Outputs
            if data.get('outputs'):
                f.write("OUTPUTS:\n")
                for key, val in data['outputs'].items():
                    if key == 'decision' and isinstance(val, dict):
                        f.write(f"\n{'='*60}\n")
                        f.write(f"FINAL DECISION:\n")
                        f.write(f"{'='*60}\n")
                        f.write(f"Result: {json.dumps(val.get('result'), ensure_ascii=False)}\n")
                        f.write(f"Success: {val.get('success')}\n")
                        f.write(f"Reason: {val.get('reason', '')}\n")
                    elif isinstance(val, str) and len(val) > 100:
                        f.write(f"\n📌 {key}:\n{val}\n\n")
                    else:
                        f.write(f"• {key}: {json.dumps(val, ensure_ascii=False)}\n")
                f.write("\n")

            # Errors
            if data.get('errors'):
                f.write("ERRORS:\n")
                for error in data['errors']:
                    f.write(f"❌ {error['type']}: {error['message']} ({error['timestamp']})\n")
                f.write("\n")

    def _rotate_files(self, name: str):
        """Delete old snapshot files if exceeding max_files limit."""
        files = sorted(self.directory.glob(f"{name}_*.json"))
        if len(files) > self.max_files:
            # Delete oldest files
            for old_file in files[:-self.max_files]:
                old_file.unlink()


class MemoryStorage(StorageBackend):
    """
    In-memory storage backend for testing.

    Stores snapshots in a dictionary. Useful for unit tests
    where filesystem I/O should be avoided.
    """

    def __init__(self):
        """Initialize in-memory storage."""
        self.snapshots = {}

    def save(self, name: str, data: dict) -> str:
        """
        Save snapshot to memory.

        Args:
            name: Snapshot name
            data: Snapshot data

        Returns:
            Identifier (name_timestamp)
        """
        if name not in self.snapshots:
            self.snapshots[name] = []

        # Add snapshot with timestamp
        snapshot_id = f"{name}_{datetime.now().isoformat()}"
        self.snapshots[name].append({
            'id': snapshot_id,
            'data': data
        })

        return snapshot_id

    def load(self, name: str) -> Optional[dict]:
        """
        Load most recent snapshot with given name.

        Args:
            name: Snapshot name

        Returns:
            Snapshot data or None if not found
        """
        if name not in self.snapshots or not self.snapshots[name]:
            return None
        return self.snapshots[name][-1]['data']

    def list(self, pattern: Optional[str] = None) -> List[str]:
        """
        List all snapshot identifiers.

        Args:
            pattern: Optional name pattern (simple startswith check)

        Returns:
            List of snapshot identifiers
        """
        result = []
        for name, snapshots in self.snapshots.items():
            if pattern is None or name.startswith(pattern):
                result.extend(s['id'] for s in snapshots)
        return sorted(result)

    def clear(self):
        """Clear all snapshots (useful for testing)."""
        self.snapshots.clear()

    def get_all(self, name: str) -> List[dict]:
        """Get all snapshots for a given name (testing helper)."""
        if name not in self.snapshots:
            return []
        return [s['data'] for s in self.snapshots[name]]
