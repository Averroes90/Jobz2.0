# Job Application Tool API

## Endpoints

### POST /api/match-fields

Match form fields to user profile data and auto-fill where possible.

**Request:**
```json
{
  "fields": [...],
  "actions": [...],
  "jobDetails": {
    "company_name": "Company Name",
    "role_title": "Role Title",
    "job_description": "Job description text"
  }
}
```

**Response:**
```json
{
  "status": "complete",
  "field_mappings": {...},
  "fill_values": {...},
  "files": {...},
  "needs_human": [...]
}
```

### GET /api/token-usage

Get token usage statistics for the current server session.

**Response:**
```json
{
  "session_total": {
    "call_count": 5,
    "total_input_tokens": 8500,
    "total_output_tokens": 2100,
    "total_tokens": 10600,
    "total_cost": 0.0423
  },
  "by_task": [
    {
      "task_name": "field_matching",
      "model": "claude-3-haiku-20240307",
      "call_count": 2,
      "input_tokens": 3000,
      "output_tokens": 600,
      "total_tokens": 3600,
      "cost_estimate": 0.006
    },
    {
      "task_name": "cover_letter",
      "model": "claude-3-5-sonnet-20241022",
      "call_count": 1,
      "input_tokens": 4000,
      "output_tokens": 1200,
      "total_tokens": 5200,
      "cost_estimate": 0.03
    }
  ]
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "job-application-tool"
}
```

### GET/POST/OPTIONS /api/test

Simple test endpoint to verify CORS is working.

**Response:**
```json
{
  "status": "ok",
  "method": "GET",
  "message": "CORS is working"
}
```

## Testing

### Test token usage endpoint
```bash
curl http://localhost:5050/api/token-usage
```

### Test health endpoint
```bash
curl http://localhost:5050/api/health
```

### Test field matching
```bash
curl -X POST http://localhost:5050/api/match-fields \
  -H "Content-Type: application/json" \
  -d '{
    "fields": [...],
    "jobDetails": {
      "company_name": "Anthropic",
      "role_title": "Product Manager"
    }
  }'
```
