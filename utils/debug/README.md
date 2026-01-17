# Debug Snapshot System

A portable, framework-agnostic debug logging system for capturing execution traces, LLM calls, and errors. Designed to be moved between projects as a standalone module.

## Features

- **Context Manager Pattern**: Wrap any function execution with `debug_snapshot()` to automatically capture debug info
- **Pluggable Storage**: File-based, in-memory, or custom storage backends
- **LLM Call Tracking**: Built-in support for logging prompts, responses, and token usage
- **Automatic Timing**: Tracks execution duration automatically
- **Multiple Formats**: JSON or human-readable pretty format
- **Zero Framework Dependencies**: Only uses Python stdlib (json, datetime, pathlib, abc, typing)
- **Portable**: Can be copied to any Python project

## Quick Start

```python
from utils.debug import debug_snapshot

def my_function(x, y):
    with debug_snapshot("my_function") as dbg:
        # Log inputs
        dbg.log_input(x=x, y=y)

        # Do some work
        result = x + y
        dbg.log_step("calculate_sum", result=result)

        # Log output
        dbg.log_output(result=result)

        return result

# Snapshot automatically saved to logs/debug/my_function_{timestamp}.json
```

## Basic Usage

### Logging Inputs and Outputs

```python
with debug_snapshot("validate_company_name") as dbg:
    dbg.log_input(url_company="ridezum", context={...})

    validated_name = extract_company_name(...)

    dbg.log_output(validated_name=validated_name)
```

### Logging Steps

```python
with debug_snapshot("process_application") as dbg:
    dbg.log_input(job_url=url)

    # Step 1
    company = extract_company(url)
    dbg.log_step("extract_company", company=company)

    # Step 2
    details = fetch_details(company)
    dbg.log_step("fetch_details", num_fields=len(details))

    dbg.log_output(details=details)
```

### Logging LLM Calls

```python
with debug_snapshot("generate_text") as dbg:
    dbg.log_input(prompt_template=template)

    response = client.messages.create(...)

    dbg.log_llm_call(
        prompt=prompt,
        response=response.content[0].text,
        model="claude-haiku-4-5",
        tokens_in=response.usage.input_tokens,
        tokens_out=response.usage.output_tokens
    )

    dbg.log_output(generated_text=response.content[0].text)
```

### Logging Decisions

```python
with debug_snapshot("validate_email") as dbg:
    dbg.log_input(email=email)

    is_valid = validate(email)

    dbg.log_decision(
        result=is_valid,
        success=is_valid,
        reason="Valid email format" if is_valid else "Invalid format"
    )

    dbg.log_output(is_valid=is_valid)
```

### Logging Errors

```python
with debug_snapshot("risky_operation") as dbg:
    dbg.log_input(data=data)

    try:
        result = process(data)
        dbg.log_output(result=result)
    except ValueError as e:
        dbg.log_error(
            error_type="ValueError",
            message=str(e)
        )
        raise
```

## Advanced Usage

### Custom Storage Location

```python
from utils.debug import debug_snapshot, FileStorage

# Store in custom directory
storage = FileStorage(directory="custom/debug/path")
with debug_snapshot("my_function", storage=storage) as dbg:
    # ... logging ...
```

### In-Memory Storage (Testing)

```python
from utils.debug import debug_snapshot, MemoryStorage

storage = MemoryStorage()
with debug_snapshot("test_function", storage=storage) as dbg:
    dbg.log_input(x=10)
    # ... test logic ...

# Retrieve the snapshot
data = storage.load("test_function")
assert data["inputs"]["x"] == 10
```

### Custom Storage Backend

```python
from utils.debug import StorageBackend

class DatabaseStorage(StorageBackend):
    def save(self, name: str, data: dict) -> str:
        # Save to database
        return db.insert("snapshots", name=name, data=data)

    def load(self, name: str) -> dict | None:
        # Load from database
        return db.query("snapshots").filter(name=name).latest()

    def list(self, pattern: str | None = None) -> list[str]:
        # List snapshots
        return db.query("snapshots").filter_like(pattern).all()

# Use custom storage
storage = DatabaseStorage()
with debug_snapshot("my_function", storage=storage) as dbg:
    # ... logging ...
```

### Disable Debug Logging

```python
# Disable for production
DEBUG_ENABLED = os.getenv("DEBUG") == "1"

with debug_snapshot("my_function", enabled=DEBUG_ENABLED) as dbg:
    # All logging calls become no-ops if disabled
    dbg.log_input(...)
```

### Pretty Format

```python
from utils.debug import FileStorage

# Use human-readable format instead of JSON
storage = FileStorage(format="pretty")
with debug_snapshot("my_function", storage=storage) as dbg:
    # ... logging ...
```

Output format:
```
============================================================
my_function - 2026-01-16T10:30:45.123456
Duration: 123.45ms
============================================================

INPUTS:
• x: 10
• y: 20

STEPS:
→ calculate_sum (2026-01-16T10:30:45.124000)
  • result: 30

OUTPUTS:
• result: 30
```

### File Rotation

```python
# Configure automatic rotation
storage = FileStorage(
    directory="logs/debug",
    rotation=True,
    max_files=50  # Keep only last 50 snapshots per name
)
```

## API Reference

### `debug_snapshot(name, storage=None, enabled=True)`

Create a debug snapshot context manager.

**Args:**
- `name` (str): Snapshot name (e.g., "validate_company_name")
- `storage` (StorageBackend, optional): Storage backend (defaults to FileStorage)
- `enabled` (bool): If False, all operations are no-ops

**Returns:** DebugSnapshot context manager

### `DebugSnapshot` Class

#### `log_input(**kwargs)`
Log input parameters as key-value pairs.

#### `log_output(**kwargs)`
Log output values as key-value pairs.

#### `log_step(step_name, **details)`
Log an intermediate execution step.

**Args:**
- `step_name` (str): Name of the step
- `**details`: Additional step details

#### `log_llm_call(prompt, response, model=None, tokens_in=None, tokens_out=None, **extra)`
Log an LLM API call.

**Args:**
- `prompt` (str): Prompt sent to LLM
- `response` (str): Response received
- `model` (str, optional): Model identifier
- `tokens_in` (int, optional): Input token count
- `tokens_out` (int, optional): Output token count
- `**extra`: Additional metadata

#### `log_decision(result, success, reason="", **extra)`
Log a final decision or result.

**Args:**
- `result` (Any): Decision/result value
- `success` (bool): Whether operation succeeded
- `reason` (str): Explanation of decision
- `**extra`: Additional decision metadata

#### `log_error(error_type, message, **extra)`
Log an error.

**Args:**
- `error_type` (str): Error type (e.g., "ValueError")
- `message` (str): Error message
- `**extra`: Additional error metadata

#### `save(name=None)`
Manually save the snapshot (auto-saves on exit by default).

**Args:**
- `name` (str, optional): Override snapshot name

**Returns:** Path or identifier of saved snapshot

### Storage Backends

#### `FileStorage(directory="logs/debug", rotation=True, max_files=100, format="json")`

Filesystem-based storage with automatic rotation.

**Args:**
- `directory` (str): Directory to store snapshots
- `rotation` (bool): Enable automatic file rotation
- `max_files` (int): Maximum files to keep per snapshot name
- `format` (str): Output format ("json" or "pretty")

#### `MemoryStorage()`

In-memory storage for testing (no filesystem I/O).

## Output Format

Snapshots are saved with the following structure:

```json
{
  "name": "validate_company_name",
  "timestamp": "2026-01-16T10:30:45.123456",
  "start_time": "2026-01-16T10:30:45.123456",
  "end_time": "2026-01-16T10:30:45.246810",
  "duration_ms": 123.45,
  "inputs": {
    "url_company": "ridezum",
    "context": {...}
  },
  "steps": [
    {
      "name": "format_context",
      "timestamp": "2026-01-16T10:30:45.125000",
      "num_headings": 5
    }
  ],
  "llm_calls": [
    {
      "timestamp": "2026-01-16T10:30:45.130000",
      "prompt": "Extract the company name...",
      "response": "Zūm",
      "model": "claude-haiku-4-5",
      "tokens_in": 150,
      "tokens_out": 5
    }
  ],
  "outputs": {
    "validated_name": "Zūm",
    "decision": {
      "result": "Zūm",
      "success": true,
      "reason": "Successfully extracted from page context"
    }
  },
  "errors": []
}
```

## Portability

This module is designed to be portable between projects:

- **Zero external dependencies**: Only uses Python stdlib
- **No framework coupling**: Works with any Python codebase (Flask, Django, FastAPI, scripts, etc.)
- **Self-contained**: Copy the entire `utils/debug/` directory to another project

### Moving to Another Project

1. Copy the entire `utils/debug/` directory
2. Import and use:
   ```python
   from utils.debug import debug_snapshot
   ```

That's it! No configuration files, no framework-specific setup.

## Examples

### Example 1: Simple Function

```python
def calculate_total(items):
    with debug_snapshot("calculate_total") as dbg:
        dbg.log_input(num_items=len(items))

        total = sum(item.price for item in items)
        dbg.log_step("sum_prices", total=total)

        tax = total * 0.1
        dbg.log_step("calculate_tax", tax=tax)

        final = total + tax
        dbg.log_output(total=total, tax=tax, final=final)

        return final
```

### Example 2: API Integration

```python
def fetch_user_data(user_id):
    with debug_snapshot("fetch_user_data") as dbg:
        dbg.log_input(user_id=user_id)

        # Call external API
        response = requests.get(f"/api/users/{user_id}")
        dbg.log_step("api_call", status_code=response.status_code)

        if response.status_code != 200:
            dbg.log_error(
                error_type="APIError",
                message=f"Status {response.status_code}"
            )
            dbg.log_decision(
                result=None,
                success=False,
                reason=f"API returned {response.status_code}"
            )
            return None

        data = response.json()
        dbg.log_decision(
            result=data,
            success=True,
            reason="Successfully fetched user data"
        )
        dbg.log_output(data=data)

        return data
```

### Example 3: LLM Pipeline

```python
def generate_response(user_query):
    with debug_snapshot("generate_response") as dbg:
        dbg.log_input(user_query=user_query)

        # Prepare prompt
        template = load_template()
        prompt = template.format(query=user_query)
        dbg.log_step("prepare_prompt", prompt_length=len(prompt))

        # Call LLM
        response = llm_client.create(
            model="claude-sonnet-4",
            messages=[{"role": "user", "content": prompt}]
        )

        answer = response.content[0].text
        dbg.log_llm_call(
            prompt=prompt,
            response=answer,
            model="claude-sonnet-4",
            tokens_in=response.usage.input_tokens,
            tokens_out=response.usage.output_tokens
        )

        dbg.log_decision(
            result=answer,
            success=True,
            reason="LLM generated response"
        )
        dbg.log_output(answer=answer)

        return answer
```

## Version

v1.0.0

## License

Copy and modify as needed for your projects.
