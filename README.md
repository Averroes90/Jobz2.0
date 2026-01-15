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
    "company_research_search": "haiku",
    "company_research_synthesize": "sonnet",
    "why_paragraph": "sonnet",
    "style_rewrite": "haiku",
    "form_analysis": "haiku",
    "application_content": "haiku"
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

## Flask Server

A Flask server (`server.py`) provides an API for the browser extension to intelligently fill job application forms using LLM-powered field analysis.

**Features:**
- **Smart Form Analysis**: Two-phase processing (form mapping → content generation)
- **Profile-Based Auto-Fill**: Loads user profile from `user-data/profile.json`
- **Custom Answers**: Company/role-specific answers in `custom_answers` section
- **Automatic File Uploads**: Serves resume and cover letter files for upload
- **Boolean Conversion**: Intelligently converts boolean values to match dropdown options (Yes/No, true/false, etc.)
- **Custom Dropdown Detection**: Handles non-standard dropdowns (Greenhouse, Lever, etc.)
- **Universal Company Detection**: Extracts company name from URL, meta tags, JSON-LD, and page structure

**Profile Structure** (`user-data/profile.json`):
```json
{
  "personal": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "555-1234",
    "country": "United States",
    "linkedin": "https://linkedin.com/in/johndoe"
  },
  "work_authorization": {
    "requires_sponsorship": false,
    "will_require_sponsorship": false
  },
  "preferences": {
    "open_to_relocation": true,
    "open_to_hybrid": true,
    "earliest_start": "Immediately"
  },
  "custom_answers": {
    "Have you ever interviewed at Anthropic before": "No",
    "Have you worked at Google": "Yes"
  }
}
```

**Field Mapping Actions:**
- Profile paths: `"personal.first_name"`, `"personal.email"`, `"custom_answers.Have you interviewed here before"`
- `"RESUME_UPLOAD"` - Resume/CV file upload fields
- `"COVER_LETTER_FULL"` - Full cover letter with header
- `"COVER_LETTER_BODY"` - Cover letter body without header
- `"COVER_LETTER_WHY"` - Just the "why company" paragraph
- `"GENERATE_ANSWER"` - Open-ended questions needing AI generation
- `"ACKNOWLEDGE_TRUE"` - Acknowledgment/consent checkboxes
- `"NEEDS_HUMAN"` - Fields requiring manual input

**Endpoints:**
- `POST /api/match-fields` - Process form fields and return matched values
- `GET /api/get-file?path=...` - Serve files for upload (resume, cover letter)
- `GET /api/health` - Health check endpoint

**Setup:**
```bash
# Install Flask dependencies (if not already installed)
pip install -r requirements.txt

# Ensure ANTHROPIC_API_KEY is set
export ANTHROPIC_API_KEY='your-key-here'

# Create user profile
mkdir -p user-data/resume
cp your_resume.pdf user-data/resume/
# Edit user-data/profile.json with your info

# Start the server
python server.py
```

The server runs on `http://localhost:5050` with CORS enabled for browser extension access.

**API Response:**
```json
{
  "status": "complete",
  "field_mappings": {
    "first_name": "personal.first_name",
    "email": "personal.email",
    "open_to_hybrid": "preferences.open_to_hybrid",
    "resume": "RESUME_UPLOAD",
    "why_company": "COVER_LETTER_WHY"
  },
  "fill_values": {
    "first_name": "John",
    "email": "john@example.com",
    "open_to_hybrid": "Yes",
    "why_company": "I want to work at Anthropic because..."
  },
  "files": {
    "resume": "/path/to/user-data/resume/resume.pdf",
    "cover_letter": "/path/to/user-data/applications/Company/cover_letter.docx"
  },
  "needs_human": ["linkedin_url"]
}
```

**Configuration:**

Form processing uses task-specific models from `config.json`:
- `form_analysis` - Maps fields to profile/actions (Haiku)
- `application_content` - Generates text for open-ended questions (Haiku)

See `prompts/README.md` for prompt details.

**Cost Optimization:**

The system is optimized for cost efficiency:
- **Form filling**: ~$0.015 per application (2 API calls with Haiku)
- **Cover letter generation**: Additional cost if needed
- **Token optimization**: Streamlined field data, limited dropdown options to 10
- **Smart caching**: Reuses cover letter content across multiple fields

**Performance Tips:**
- Use Haiku for form analysis (fast and cheap)
- Only generate cover letters when needed
- Leverage profile data for instant fills
- Add custom_answers for frequently asked questions

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