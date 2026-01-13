<!-- markdownlint-disable -->
# Job Application Tool

Streamline cover letter generation for job applications.

## Phase 1: Cover Letter Generator

Generates customized cover letters by:
1. Looking up company headquarters address (via Claude API with web search)
2. Researching the company and role (via Claude API with web search)
3. Generating a company-specific "why I want to work here" paragraph (via Claude API)
4. Rewriting the paragraph for style and clarity (via Claude API)
5. Creating a formatted .docx from your template

### Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Set your API key - Option 1: Environment variable
export ANTHROPIC_API_KEY='your-key-here'

# Set your API key - Option 2: .env file (recommended)
echo "ANTHROPIC_API_KEY=your-key-here" > .env
```

### Usage

Basic usage:
```bash
python generate_cover_letter.py "Scale AI" "Technical Program Manager"
```

With job description from file:
```bash
python generate_cover_letter.py "Meta" "Product Manager, AI" --job-desc-file job_description.txt
```

With job description inline:
```bash
python generate_cover_letter.py "OpenAI" "TPM" --job-description "Role involves..."
```

With role location (uses specific office address):
```bash
python generate_cover_letter.py "Anthropic" "Product Manager" --role-location "San Francisco"
```

With model override (optional - uses task-specific defaults if not specified):
```bash
# Override all tasks to use haiku (fast and cheap)
python generate_cover_letter.py "Anthropic" "Product Manager" --model haiku

# Override all tasks to use sonnet (balanced)
python generate_cover_letter.py "Anthropic" "Product Manager" --model sonnet

# Override all tasks to use opus (best quality)
python generate_cover_letter.py "Anthropic" "Product Manager" --model opus

# No --model flag: uses task-specific defaults from config.json
python generate_cover_letter.py "Anthropic" "Product Manager"
```

With custom delay between API calls:
```bash
# Faster (2 seconds)
python generate_cover_letter.py "Anthropic" "Product Manager" --delay 2

# Slower to be safe (10 seconds)
python generate_cover_letter.py "Anthropic" "Product Manager" --delay 10
```

With custom prompt file:
```bash
python generate_cover_letter.py "OpenAI" "TPM" --custom-prompt-file my_custom_prompt.md
```

Dry run (preview without creating file):
```bash
python generate_cover_letter.py "Anthropic" "TPM" --dry-run
```

Skip research (manual address, no company context):
```bash
python generate_cover_letter.py "Startup Inc" "PM" --skip-research --address1 "123 Main St," --address2 "San Francisco, CA 94102"
```

### Output Structure

Generated files are saved to `~/Documents/resume/` (configurable in `config.json`):
```
~/Documents/resume/
└── Company_Name/
    ├── Rami_Ibrahimi_Company_Name_2026-01-13_Role_Title.docx  # Timestamped version
    └── Rami_Ibrahimi_Cover_letter_Company_Name.docx           # Latest version (overwritten)
```

**Two files are created:**
- **Timestamped version:** Archives each cover letter with company, date, and role
- **Latest version:** Always points to the most recent cover letter for that company

**Note:** Filename prefix is configurable via `config.json` (`output.filename_prefix`)

### Customizing the Template

The template is at `template/cover_letter_template.docx`. It uses these placeholders:
- `{{DATE}}` - Auto-filled with current date
- `{{COMPANY_NAME}}` - Company hiring team
- `{{COMPANY_ADDRESS_LINE1}}` - Street address
- `{{COMPANY_ADDRESS_LINE2}}` - City, State ZIP
- `{{ROLE_TITLE}}` - Job title and company
- `{{WHY_COMPANY_PARAGRAPH}}` - Generated paragraph

### Customizing Prompts

All prompts are externalized in the `prompts/` directory:

**`prompts/address_lookup_prompt.md`**
- Controls how company addresses are found
- Supports role location preference

**`prompts/company_research_prompt.md`**
- Defines what company information to research
- Structured output: products, metrics, problems, recent activity, role context

**`prompts/my_background.md`**
- Your professional background and experience
- Used as context for generating the "why" paragraph

**`prompts/why_company_prompt.md`**
- Controls structure and style of the cover letter paragraph
- Defines opening, middle actions, and closing
- Style rules: plain language, active voice, specific metrics

**`prompts/style_rewrite_prompt.md`**
- Post-processing rules for the generated paragraph
- Enforces formatting constraints (sentence count, structure)
- Simplifies language while preserving metrics

### CLI Reference

```
usage: generate_cover_letter.py [-h] [--job-description TEXT]
                                [--job-desc-file FILE]
                                [--custom-prompt TEXT]
                                [--custom-prompt-file FILE]
                                [--dry-run] [--output-dir DIR]
                                [--role-location LOCATION]
                                [--model {haiku,sonnet,opus}]
                                [--delay DELAY]
                                [--skip-research]
                                [--address1 TEXT] [--address2 TEXT]
                                company role

positional arguments:
  company                    Company name
  role                       Job title/role

optional arguments:
  --job-description TEXT     Job description text (inline)
  --job-desc-file FILE       Job description from file
  --custom-prompt TEXT       Custom paragraph prompt (inline)
  --custom-prompt-file FILE  Custom paragraph prompt from file
  --role-location LOCATION   Office location (e.g., "San Francisco", "Remote")
  --model {haiku,sonnet,opus} Override model for all API calls (default: task-specific from config.json)
  --delay DELAY              Delay in seconds between API calls (default: 5)
  --dry-run                  Preview without creating files
  --output-dir DIR           Output directory (default: ~/Documents/resume)
  --skip-research            Skip API calls, use manual values
  --address1 TEXT            Manual address line 1 (with --skip-research)
  --address2 TEXT            Manual address line 2 (with --skip-research)
```

### Configuration

All configuration is centralized in `config.json`:

```json
{
  "model_definitions": {
    "haiku": {
      "provider": "anthropic",
      "model_id": "claude-haiku-4-5-20250514",
      "description": "Fast, cheap"
    },
    "sonnet": {
      "provider": "anthropic",
      "model_id": "claude-sonnet-4-20250514",
      "description": "Balanced"
    },
    "opus": {
      "provider": "anthropic",
      "model_id": "claude-opus-4-20250514",
      "description": "Best quality"
    }
  },
  "task_models": {
    "address_lookup": "haiku",
    "company_research": "sonnet",
    "why_paragraph": "sonnet",
    "style_rewrite": "haiku"
  },
  "api_settings": {
    "retry_attempts": 3,
    "retry_wait_seconds": 90
  },
  "output": {
    "root_directory": "~/Documents/resume",
    "filename_prefix": "Rami_Ibrahimi"
  }
}
```

**Configuration sections:**

- **`model_definitions`**: Available models with provider, model_id, and description
- **`task_models`**: Maps each task to its default model (address_lookup, company_research, why_paragraph, style_rewrite)
- **`api_settings`**: Retry logic configuration for rate limiting
- **`output`**: Output directory and filename prefix

**Customizing:**

1. **Add new models**: Edit `model_definitions` with provider-agnostic structure (supports Anthropic, OpenAI, Google, etc.)
2. **Change task defaults**: Edit `task_models` to use different models for different tasks
3. **Adjust retry logic**: Modify `retry_attempts` and `retry_wait_seconds`
4. **Change output location**: Update `root_directory` and `filename_prefix`

**Model selection behavior:**

- Without `--model` flag: Each task uses its default from `task_models`
- With `--model` flag: All tasks use the specified model (overrides defaults)

## Browser Extension

A Chrome extension for scanning form fields on job application pages is available in `browser-extension/`.

**Features:**
- Scans all visible form fields (input, select, textarea)
- Extracts field labels, types, required status, and current values
- Simple popup UI with JSON output

**Installation:**
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `browser-extension/` directory

See [browser-extension/README.md](browser-extension/README.md) for detailed usage.

## Roadmap

### Phase 2: Application Tracker (Planned)
- SQLite database to track applications
- Duplicate detection
- Status tracking
- Notes and follow-up reminders

### Phase 3: Browser Automation (Planned)
- LinkedIn job search automation
- Randomized behavior to avoid detection
- Auto-apply for "Easy Apply" jobs
<!-- markdownlint-enable -->