<!-- markdownlint-disable -->
# Job Application Tool

Streamline cover letter generation for job applications.

## Phase 1: Cover Letter Generator

Generates customized cover letters by:
1. Looking up company headquarters address (via Claude API with web search)
2. Researching the company and role (via Claude API with web search)
3. Generating a company-specific "why I want to work here" paragraph (via Claude API)
4. Creating a formatted .docx from your template

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

Generated files are saved to `~/Documents/resume/`:
```
~/Documents/resume/
└── Company_Name/
    ├── Rami_Ibrahimi_Company_Name_2026-01-12_Role_Title.docx  # Timestamped version
    └── Ibrahimi_Rami_Cover_letter_Company_Name.docx           # Latest version (overwritten)
```

**Two files are created:**
- **Timestamped version:** Archives each cover letter with company, date, and role
- **Latest version:** Always points to the most recent cover letter for that company

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

### CLI Reference

```
usage: generate_cover_letter.py [-h] [--job-description TEXT]
                                [--job-desc-file FILE]
                                [--custom-prompt TEXT]
                                [--custom-prompt-file FILE]
                                [--dry-run] [--output-dir DIR]
                                [--role-location LOCATION]
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
  --dry-run                  Preview without creating files
  --output-dir DIR           Output directory (default: ~/Documents/resume)
  --skip-research            Skip API calls, use manual values
  --address1 TEXT            Manual address line 1 (with --skip-research)
  --address2 TEXT            Manual address line 2 (with --skip-research)
```

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