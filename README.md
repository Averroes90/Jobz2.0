<!-- markdownlint-disable -->
# Job Application Tool

Streamline cover letter generation for job applications.

## Phase 1: Cover Letter Generator

Generates customized cover letters by:
1. Researching the company via Claude API with web search
2. Finding company headquarters address
3. Generating a company-specific "why I want to work here" paragraph
4. Creating a formatted .docx from your template

### Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Set your API key
export ANTHROPIC_API_KEY='your-key-here'
```

### Usage

Basic usage:
```bash
python generate_cover_letter.py "Scale AI" "Technical Program Manager"
```

With job posting URL (for more context):
```bash
python generate_cover_letter.py "Meta" "Product Manager, AI" --job-url "https://..."
```

With custom prompt file:
```bash
python generate_cover_letter.py "OpenAI" "TPM" --custom-prompt-file prompts/why_company_prompt.md
```

Dry run (preview without creating file):
```bash
python generate_cover_letter.py "Anthropic" "TPM" --dry-run
```

Skip research (manual address):
```bash
python generate_cover_letter.py "Startup Inc" "PM" --skip-research --address1 "123 Main St," --address2 "San Francisco, CA 94102"
```

### Output Structure

Generated files are saved to:
```
applications/
└── Company_Name/
    └── Rami_Ibrahimi_2026-01-05_Company_Name.docx
```

### Customizing the Template

The template is at `template/cover_letter_template.docx`. It uses these placeholders:
- `{{DATE}}` - Auto-filled with current date
- `{{COMPANY_NAME}}` - Company hiring team
- `{{COMPANY_ADDRESS_LINE1}}` - Street address
- `{{COMPANY_ADDRESS_LINE2}}` - City, State ZIP
- `{{ROLE_TITLE}}` - Job title and company
- `{{WHY_COMPANY_PARAGRAPH}}` - Generated paragraph

### Customizing the "Why" Paragraph

Edit `prompts/why_company_prompt.md` to refine how the paragraph is generated.

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