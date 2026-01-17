"""
Output formatters for debug snapshots.

Provides various formatting functions for rendering debug snapshot
data in different formats (JSON, pretty-print, etc.).
"""

import json
from typing import Dict, Any, List


def format_as_json(data: Dict, indent: int = 2) -> str:
    """
    Format snapshot data as JSON.

    Args:
        data: Snapshot data dictionary
        indent: JSON indentation level

    Returns:
        JSON-formatted string
    """
    return json.dumps(data, indent=indent, ensure_ascii=False)


def format_as_pretty(data: Dict) -> str:
    """
    Format snapshot data in human-readable format.

    Creates a structured text output with sections for inputs,
    steps, LLM calls, outputs, and errors.

    Args:
        data: Snapshot data dictionary

    Returns:
        Pretty-formatted string
    """
    lines = []

    # Header
    lines.append("=" * 60)
    lines.append(f"{data['name']} - {data['timestamp']}")
    if data.get('duration_ms'):
        lines.append(f"Duration: {data['duration_ms']:.2f}ms")
    lines.append("=" * 60)
    lines.append("")

    # Inputs
    if data.get('inputs'):
        lines.append("INPUTS:")
        for key, val in data['inputs'].items():
            if isinstance(val, str) and len(val) > 100:
                lines.append(f"\n📌 {key}:")
                lines.append(val)
                lines.append("")
            else:
                lines.append(f"• {key}: {json.dumps(val, ensure_ascii=False)}")
        lines.append("")

    # Steps
    if data.get('steps'):
        lines.append("STEPS:")
        for step in data['steps']:
            lines.append(f"→ {step['name']} ({step['timestamp']})")
            for key, val in step.items():
                if key not in ['name', 'timestamp']:
                    lines.append(f"  • {key}: {json.dumps(val, ensure_ascii=False)}")
        lines.append("")

    # LLM Calls
    if data.get('llm_calls'):
        lines.append("LLM CALLS:")
        for i, call in enumerate(data['llm_calls'], 1):
            lines.append("")
            lines.append("=" * 60)
            lines.append(f"Call #{i} - {call.get('model', 'unknown')} ({call['timestamp']})")
            lines.append("=" * 60)
            lines.append("")
            lines.append(f"PROMPT:")
            lines.append(call['prompt'])
            lines.append("")
            lines.append(f"RESPONSE:")
            lines.append(call['response'])
            lines.append("")
            if call.get('tokens_in') or call.get('tokens_out'):
                lines.append(f"Tokens: {call.get('tokens_in', 0)} in, {call.get('tokens_out', 0)} out")
                lines.append("")

    # Outputs
    if data.get('outputs'):
        lines.append("OUTPUTS:")
        for key, val in data['outputs'].items():
            if key == 'decision' and isinstance(val, dict):
                lines.append("")
                lines.append("=" * 60)
                lines.append("FINAL DECISION:")
                lines.append("=" * 60)
                lines.append(f"Result: {json.dumps(val.get('result'), ensure_ascii=False)}")
                lines.append(f"Success: {val.get('success')}")
                lines.append(f"Reason: {val.get('reason', '')}")
            elif isinstance(val, str) and len(val) > 100:
                lines.append(f"\n📌 {key}:")
                lines.append(val)
                lines.append("")
            else:
                lines.append(f"• {key}: {json.dumps(val, ensure_ascii=False)}")
        lines.append("")

    # Errors
    if data.get('errors'):
        lines.append("ERRORS:")
        for error in data['errors']:
            lines.append(f"❌ {error['type']}: {error['message']} ({error['timestamp']})")
        lines.append("")

    return "\n".join(lines)


def format_llm_call(
    call_data: Dict,
    call_number: int = 1,
    include_header: bool = True
) -> str:
    """
    Format a single LLM call for display.

    Args:
        call_data: LLM call data dictionary
        call_number: Call number for display
        include_header: Whether to include the header separator

    Returns:
        Formatted string
    """
    lines = []

    if include_header:
        lines.append("=" * 60)

    lines.append(f"Call #{call_number} - {call_data.get('model', 'unknown')} ({call_data['timestamp']})")

    if include_header:
        lines.append("=" * 60)

    lines.append("")
    lines.append("PROMPT:")
    lines.append(call_data['prompt'])
    lines.append("")
    lines.append("RESPONSE:")
    lines.append(call_data['response'])
    lines.append("")

    if call_data.get('tokens_in') or call_data.get('tokens_out'):
        tokens_in = call_data.get('tokens_in', 0)
        tokens_out = call_data.get('tokens_out', 0)
        lines.append(f"Tokens: {tokens_in} in, {tokens_out} out")
        lines.append("")

    return "\n".join(lines)


def format_step(step_data: Dict, include_timestamp: bool = True) -> str:
    """
    Format a single execution step for display.

    Args:
        step_data: Step data dictionary
        include_timestamp: Whether to include timestamp

    Returns:
        Formatted string
    """
    lines = []

    timestamp_str = f" ({step_data['timestamp']})" if include_timestamp else ""
    lines.append(f"→ {step_data['name']}{timestamp_str}")

    for key, val in step_data.items():
        if key not in ['name', 'timestamp']:
            lines.append(f"  • {key}: {json.dumps(val, ensure_ascii=False)}")

    return "\n".join(lines)


def format_summary(data: Dict) -> str:
    """
    Format a brief summary of the snapshot.

    Useful for logs or quick inspection.

    Args:
        data: Snapshot data dictionary

    Returns:
        Summary string
    """
    parts = [data['name']]

    if data.get('duration_ms'):
        parts.append(f"{data['duration_ms']:.2f}ms")

    if data.get('llm_calls'):
        parts.append(f"{len(data['llm_calls'])} LLM call(s)")

    if data.get('steps'):
        parts.append(f"{len(data['steps'])} step(s)")

    if data.get('errors'):
        parts.append(f"❌ {len(data['errors'])} error(s)")

    decision = data.get('outputs', {}).get('decision')
    if decision:
        success_str = "✓" if decision.get('success') else "✗"
        parts.append(f"{success_str} {decision.get('result')}")

    return " | ".join(parts)


def format_error_list(errors: List[Dict]) -> str:
    """
    Format a list of errors.

    Args:
        errors: List of error dictionaries

    Returns:
        Formatted error list
    """
    if not errors:
        return "No errors"

    lines = []
    for error in errors:
        lines.append(f"❌ {error['type']}: {error['message']} ({error['timestamp']})")

    return "\n".join(lines)
