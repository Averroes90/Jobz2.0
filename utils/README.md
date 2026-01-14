# Utils

Utility modules for the job application tool.

## Token Tracker

The `TokenTracker` class monitors API token usage and estimates costs.

### Basic Usage

```python
from utils import TokenTracker

tracker = TokenTracker()

# Log an API call
tracker.log_call(
    task_name="field_matching",
    model="claude-3-haiku-20240307",
    input_tokens=1500,
    output_tokens=300,
    metadata={"form_fields": 12}  # optional
)

# Print summary
tracker.print_summary()

# Get totals
total = tracker.get_session_total()
print(f"Total cost: ${total['total_cost']:.4f}")

# Export full log
tracker.export_log("logs/export.json")
```

### Global Tracker

Use the global singleton instance across modules:

```python
from utils import get_tracker

tracker = get_tracker()
tracker.log_call("cover_letter", "sonnet", 3000, 800)
```

### Pricing

Current rates (per 1M tokens):
- **Haiku**: $1.00 input / $5.00 output
- **Sonnet**: $3.00 input / $15.00 output
- **Opus**: $15.00 input / $75.00 output

### Log Files

- `logs/token_usage.jsonl` - Append-only JSONL log of all calls
- Export files - Full JSON export with summary and all calls

### Integration Example

```python
from anthropic import Anthropic
from utils import get_tracker, track_api_call

client = Anthropic()
tracker = get_tracker()

response = client.messages.create(
    model="claude-3-haiku-20240307",
    messages=[{"role": "user", "content": "Hello"}],
    max_tokens=1024
)

# Use helper function to automatically extract and log
track_api_call(tracker, "greeting", response.model, response)

# Or manually log
tracker.log_call(
    task_name="greeting",
    model=response.model,
    input_tokens=response.usage.input_tokens,
    output_tokens=response.usage.output_tokens
)
```
