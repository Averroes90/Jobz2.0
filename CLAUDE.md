# Claude Code Project Documentation

## Custom Instructions

1. **ADD DEBUG LOGS**: When making code/prompt changes, wrap functions with `debug_snapshot()` from `utils/debug` to track execution.

2. **CHECK LOGS FIRST**: Before asking user for console output or errors, check `logs/server.log`, `logs/debug/`, and `logs/token_usage.jsonl`.

3. **CODE OVER PROMPTS**: Before prompt changes, check if a simple code fix is cleaner. Prefer deterministic code for obvious cases, but don't over-engineer what a prompt sentence handles better.

---

## Project Overview

Job application automation tool that generates customized cover letters and auto-fills application forms using LLM-powered field matching.

**Core Capabilities:**
- Automated cover letter generation with company research
- Browser extension for form scanning and filling
- LLM-powered form field mapping to user profile
- Token usage tracking and cost monitoring

---

## Project Structure

### Root Directories

```
job-app-tool/
├── browser-extension/    # Chrome extension for form scanning/filling
├── cache/                # API response cache (web search, company research)
├── logs/                 # Server logs, token usage, debug snapshots
├── prompts/              # Externalized LLM prompt templates
├── scripts/              # Utility scripts (logging, prompt usage tracking)
├── template/             # Cover letter .docx template
├── user-data/            # User profile, resume, generated applications
├── utils/                # Shared utilities (debug, token tracking, caching, logging)
└── venv/                 # Python virtual environment
```

### Key Files

| File | Purpose |
|------|---------|
| `server.py` | Flask backend API for form field matching |
| `generate_cover_letter.py` | Cover letter generation pipeline |
| `config.json` | Model assignments and configuration |
| `requirements.txt` | Python dependencies |
| `debug_request.json` | Debug: Last received form scan data |
| `debug_company_name.json` | Debug: Company name validation context |

### Browser Extension Files

| File | Purpose |
|------|---------|
| `content.js` | Form field scanning and auto-fill logic |
| `popup.js` | Extension popup UI and API communication |
| `popup.html` | Extension popup interface |
| `manifest.json` | Chrome extension configuration |
| `test_form.html` | Test form for development |

### User Data Structure

```
user-data/
├── profile.json          # User profile data (name, email, work history, etc.)
├── resume/               # Resume files (.pdf, .docx)
└── applications/         # Generated cover letters organized by company
    └── {Company_Name}/
        ├── {Company}_cover_letter.docx
        └── {Company}_why_paragraph.txt
```

---

## Key Commands

### Server Management

```bash
# Start Flask server (default: http://localhost:5050)
python server.py

# View server logs (real-time)
tail -f server.log

# View browser extension logs only
tail -f server.log | grep BROWSER

# View token usage logs
bash scripts/logs.sh
```

### Cover Letter Generation

```bash
# Basic usage
python generate_cover_letter.py "Company Name" "Role Title"

# With job description from file
python generate_cover_letter.py "Company" "Role" --job-desc-file description.txt

# With inline job description
python generate_cover_letter.py "Company" "Role" --job-description "Role involves..."

# With specific office location
python generate_cover_letter.py "Company" "Role" --role-location "San Francisco"

# Dry run (no file write, see output only)
python generate_cover_letter.py "Company" "Role" --dry-run

# Override model (optional, uses config.json defaults)
python generate_cover_letter.py "Company" "Role" --model opus
```

### Development Tools

```bash
# View prompt usage across codebase
python scripts/prompt_usage.py

# Pack/unpack .docx for template editing
python scripts/unpack.py template/cover_letter_template.docx
# Edit word/document.xml
python scripts/pack.py template/cover_letter_template.docx

# Convert token logs to readable format
python scripts/convert_token_logs.py
```

### Browser Extension

```bash
# Reload extension after code changes:
1. Navigate to chrome://extensions/
2. Enable "Developer mode"
3. Click reload icon on extension card

# View extension console logs:
1. Server logs (recommended): tail -f server.log | grep BROWSER
2. Browser DevTools: F12 on job application page → Console tab
3. Popup DevTools: Right-click extension icon → Inspect popup
```

**Note:** Extension logs are automatically sent to backend via `/api/console-log` endpoint and appear in `server.log` with `BROWSER_*` prefixes.

---

## Architecture

### Overall Flow

```
User → Browser Extension → Flask Server → LLM APIs → Filled Form + Cover Letter
```

### Cover Letter Generation Pipeline

```
1. address_lookup          → Company headquarters address
2. company_research_search → Raw facts about company (web search)
3. company_research_synthesize → Structured company context
4. why_company_prompt      → Initial "why I want to work here" paragraph
5. style_rewrite           → Polished final paragraph
6. Template rendering      → .docx generation with placeholders
```

### Form Processing Pipeline (3-Phase)

**Phase 1: Form Analysis** (`form_analysis_prompt.md`)
- Browser extension scans form fields with all dropdown/radio/checkbox options
- LLM analyzes form holistically
- Returns `field_guidance` (actions for each field) and `dropdown_selections` (best matches)

**Phase 2: Field Matching** (`field_matching_prompt.md`)
- Uses Phase 1 guidance + user profile
- Maps fields to actual profile values or action strings:
  - `RESUME_UPLOAD` - Resume/CV file upload
  - `COVER_LETTER_FULL` - Full cover letter with header
  - `COVER_LETTER_BODY` - Cover letter body without header
  - `COVER_LETTER_WHY` - Just the why-company paragraph
  - `GENERATE_ANSWER` - Generate contextual answer
  - `ACKNOWLEDGE_TRUE` - Agreement checkboxes
  - `NEEDS_HUMAN` - Requires manual input
  - `SKIP` - EEO/demographic fields to review

**Phase 3: Content Generation** (`application_content_prompt.md`)
- Generates text for fields marked `GENERATE_ANSWER`
- Uses cover letter, why paragraph, and profile as context
- Avoids duplication across similar fields

**Phase 4: Form Filling**
- Browser extension receives mappings and generated content
- Auto-fills form fields
- User reviews and submits

---

## Conventions

### Externalized Prompts

All LLM prompts live in `prompts/` directory as `.md` files.

**Loading a prompt:**
```python
prompt_template = load_prompt("your_prompt_name.md")
prompt = prompt_template.format(variable=value)
```

**Placeholder syntax:**
```markdown
Your prompt text with {variable_name} placeholders.
```

### Model Configuration

Models are assigned per task in `config.json`:

```json
{
  "task_models": {
    "address_lookup": "haiku",
    "company_research": "sonnet",
    "form_analysis": "haiku",
    "application_content": "haiku"
  },
  "model_definitions": {
    "haiku": {"model_id": "claude-haiku-4-5-20251001"},
    "sonnet": {"model_id": "claude-sonnet-4-20250514"},
    "opus": {"model_id": "claude-opus-4-20250514"}
  }
}
```

**Model Selection:**
- **Haiku** - Fast, cheap (~$0.25 per 1M input tokens) - Use for simple tasks
- **Sonnet** - Balanced (~$3 per 1M input tokens) - Use for complex reasoning
- **Opus** - Best quality (~$15 per 1M input tokens) - Currently unused, available

### Token Tracking

Global token tracker in `server.py` and `generate_cover_letter.py`:

```python
from utils import TokenTracker, track_api_call

tracker = TokenTracker()

# After each API call:
track_api_call(tracker, "task_name", model_id, response)

# View usage:
tracker.print_summary()
```

**Logs stored in:** `token_usage.log` (JSON format)

### Logging

Pretty-printed logs with PrettyLogger:

```python
from utils import PrettyLogger

logger = PrettyLogger(filename="server.log")
logger.log("REQUEST", data)  # Structured JSON logging
```

**Log files:**
- `server.log` - Flask server activity, API calls, field mappings
- `token_usage.log` - Token consumption per API call

### Caching

Web search and company research responses are cached:

```python
from utils import ResponseCache

cache = ResponseCache("cache/")
cached_response = cache.get(cache_key)
cache.set(cache_key, response_data)
```

**Cache location:** `cache/` directory (JSON files)

### Debug Snapshots

Debug execution traces with the centralized snapshot system:

```python
from utils.debug import debug_snapshot

with debug_snapshot("function_name") as dbg:
    dbg.log_input(param=value)
    dbg.log_step("step_name", details=data)
    dbg.log_llm_call(prompt="...", response="...", model="haiku")
    dbg.log_decision(result=value, success=True, reason="...")
    dbg.log_output(result=value)
```

**Snapshot location:** `logs/debug/{function_name}_{timestamp}.json`

See `utils/debug/README.md` for full documentation and portability guide.

### Browser Logging

Browser extension console logs are automatically sent to the backend for centralized debugging.

**Implementation:**
```javascript
// In content.js - automatically sends logs to server
logToBackend('info', 'Message here');
logToBackend('debug', 'Debug details');
logToBackend('error', 'Error message');
```

**Logs are written to `server.log` with prefixes:**
- `BROWSER_INFO` - Informational messages
- `BROWSER_DEBUG` - Debug messages
- `BROWSER_ERROR` - Error messages

**View browser logs in real-time:**
```bash
tail -f server.log | grep BROWSER
```

This allows debugging extension behavior without opening browser DevTools.

---

## Debugging

### Log File Locations

| File | Purpose | How to View |
|------|---------|-------------|
| `logs/server.log` | Flask server logs + browser console | `tail -f logs/server.log` |
| `logs/server.log` (browser only) | Browser extension logs only | `tail -f logs/server.log \| grep BROWSER` |
| `logs/token_usage.log` | Token usage per call | `bash scripts/logs.sh` |
| `logs/debug/*.json` | Debug snapshots (inputs, LLM calls, outputs) | `ls -lt logs/debug/` |
| `debug_request.json` | Last form scan received (legacy) | `cat debug_request.json` |
| `debug_why_paragraph.txt` | Last why-paragraph prompt (legacy) | `cat debug_why_paragraph.txt` |

### Debug Workflow

**Problem: Form field not mapping correctly**
1. Check `server.log` for field mapping output
2. Check `debug_request.json` to see what extension sent
3. Look at Phase 1 (form_analysis) and Phase 2 (field_matching) outputs in logs

**Problem: Cover letter generation failing**
1. Check `debug_why_paragraph.txt` for the prompt sent to LLM
2. Check `server.log` for error messages
3. Verify `user-data/profile.json` exists and is valid JSON

**Problem: Extension not capturing form fields**
1. Check `server.log` for browser logs: `tail -f server.log | grep BROWSER`
2. Look for context capture logs (headings, nav links, form labels counts)
3. Open browser DevTools (F12) → Console tab as backup
4. Check if content.js is loaded: look for "Form scan complete" message

**Problem: Token usage unexpectedly high**
1. Run `bash scripts/logs.sh` to see per-call breakdown
2. Check if cache is working: look in `cache/` directory
3. Review which model is assigned in `config.json`

### Common Debug Flags

```python
# In generate_cover_letter.py
run_pipeline(company_name, role_title, dry_run=True)  # No file write

# In server.py
print(f"DEBUG: {variable}")  # Prints to console
logger.log("DEBUG_TAG", data)  # Logs to server.log
```

### Browser Console Commands

```javascript
// In browser console (F12), test extension:
chrome.runtime.sendMessage({action: "scan_form"}, response => {
  console.log(response);
});

// Check if content script loaded:
console.log("Content script loaded:", typeof scanFormFields !== 'undefined');
```

---

## Prompt Files

### Current Prompt Inventory

Based on `prompts/README.md`, here are all active prompt templates:

| Prompt File | Purpose | Inputs | Model |
|-------------|---------|--------|-------|
| `address_lookup_prompt.md` | Find company headquarters or office address | `company_name`, `role_location_if_known` | haiku |
| `company_research_search_prompt.md` | Gather raw facts about company (web search) | `company_name`, `role_title` | haiku |
| `company_research_synthesize_prompt.md` | Synthesize raw facts into structured context | `company_name`, `role_title`, `raw_facts`, `job_description` | sonnet |
| `why_company_prompt.md` | Generate "why I want to work here" paragraph | `company_name`, `role_title`, `company_context`, `my_background`, `job_description` | sonnet |
| `style_rewrite_prompt.md` | Rewrite paragraph for style and clarity | `paragraph` | haiku |
| `form_analysis_prompt.md` | Analyze form structure holistically | `form_fields` (JSON with dropdown/radio/checkbox options) | haiku |
| `field_matching_prompt.md` | Map form fields to profile values or actions | `profile` (JSON), `form_analysis` (JSON) | haiku |
| `application_content_prompt.md` | Generate text content for application fields | `cover_letter_text`, `why_paragraph`, `profile`, `fields_json`, `form_analysis` | haiku |
| `company_name_extraction_prompt.md` | Validate/extract accurate company name from page context | `url_company`, `page_title`, `headings`, `nav_links`, `form_labels`, `company_links`, `job_description_sample` | haiku |
| `my_background.md` | User's professional background (static context) | N/A (user-edited content) | N/A |

### Prompt Flow Diagram

```
Cover Letter Generation:
  address_lookup → company_research_search → company_research_synthesize
    → why_company → style_rewrite → Cover Letter .docx

Form Processing:
  Form Fields → form_analysis → field_matching → application_content → Filled Form

Company Name Validation:
  URL + Page Context → company_name_extraction → Validated Company Name
```

### Adding New Prompts

See `prompts/README.md` for detailed checklist. Quick summary:

1. Create `prompts/your_prompt.md` with `{placeholder}` syntax
2. Add entry to `config.json` under `task_models`
3. Load and use in code:
   ```python
   prompt_template = load_prompt("your_prompt.md")
   prompt = prompt_template.format(var=value)
   ```
4. Update `prompts/README.md` with purpose and inputs
5. Run `python scripts/prompt_usage.py` to verify

---

## Development Guidelines

### Making Changes to Extension

1. Edit `browser-extension/content.js` or `popup.js`
2. Reload extension at `chrome://extensions/`
3. Refresh the job application page
4. Check browser console (F12) for errors

### Making Changes to Backend

1. Edit `server.py` or `generate_cover_letter.py`
2. Restart Flask server (`Ctrl+C`, then `python server.py`)
3. Check `server.log` for errors
4. Test with extension or direct Python call

### Making Changes to Prompts

1. Edit prompt file in `prompts/`
2. No server restart needed (prompts loaded on each request)
3. Check `debug_*.txt` files to verify prompt formatting
4. Update `prompts/README.md` if changing inputs/outputs

### Testing Changes

```bash
# Test cover letter generation
python generate_cover_letter.py "Test Company" "Test Role" --dry-run

# Test server endpoint
curl -X POST http://localhost:5000/api/match-fields \
  -H "Content-Type: application/json" \
  -d @test_payload.json

# Test extension on test form
# Open browser-extension/test_form.html in Chrome
```

---

## Troubleshooting

### Extension not working after changes
- Clear browser cache: `chrome://settings/clearBrowserData`
- Hard reload extension: Remove and re-add at `chrome://extensions/`
- Check manifest.json permissions

### "No such file or directory" errors
- Verify `user-data/profile.json` exists
- Verify `template/cover_letter_template.docx` exists
- Check file paths in `config.json`

### API rate limits or errors
- Check `ANTHROPIC_API_KEY` is set correctly
- Verify API key has sufficient credits
- Check network connectivity

### Form fields not auto-filling
- Check if field IDs match between scan and fill
- Verify field is visible (not display: none)
- Check browser console for JavaScript errors
- Try test_form.html to isolate issue

---

## Additional Resources

- **API Documentation**: `API.md`
- **Form Filling Details**: `browser-extension/FORM_FILLING.md`
- **Prompt System**: `prompts/README.md`
- **Utilities**: `utils/README.md`
- **Change Log**: `CHANGES.md`
