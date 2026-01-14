# Prompts Directory

This directory contains all prompt templates used by the job application tool for LLM interactions.

## Prompt Flow

```mermaid
graph TD
    subgraph "Cover Letter Generation"
        A[address_lookup_prompt.md] -->|company address| B[company_research_prompt.md]
        B -->|company context| C[why_company_prompt.md]
        D[my_background.md] -->|user background| C
        C -->|initial paragraph| E[style_rewrite_prompt.md]
        E -->|final paragraph| F[Cover Letter DOCX]
    end

    subgraph "Form Field Matching"
        G[field_matching_prompt.md] -->|field mapping| H[Browser Extension]
        I[user-data/profile.json] -->|profile data| G
        J[Form Fields] -->|scanned fields| G
    end

    subgraph "Future: Auto-Fill"
        H -->|unmapped fields| K[freeform_answer_prompt.md]
        H -->|specific questions| L[specific_question_prompt.md]
        K --> M[Filled Form]
        L --> M
    end

    style K fill:#f0f0f0,stroke:#ccc,stroke-dasharray: 5 5
    style L fill:#f0f0f0,stroke:#ccc,stroke-dasharray: 5 5
    style M fill:#f0f0f0,stroke:#ccc,stroke-dasharray: 5 5
```

## Prompt Inventory

| Prompt File | Purpose | Inputs | Outputs | Model |
|-------------|---------|--------|---------|-------|
| `address_lookup_prompt.md` | Find company headquarters or office address | `company_name`, `role_location_if_known` | `ADDRESS_LINE1`, `ADDRESS_LINE2` (structured text) | haiku |
| `company_research_prompt.md` | Research company and role context | `company_name`, `role_title`, `job_description` | Structured company context (products, metrics, problems, recent activity) | sonnet |
| `why_company_prompt.md` | Generate "why I want to work here" paragraph | `company_name`, `role_title`, `company_context`, `my_background`, `job_description` | Cover letter paragraph (plain text) | sonnet |
| `style_rewrite_prompt.md` | Rewrite paragraph for style and clarity | `paragraph` | Rewritten paragraph (max 4 sentences, simplified) | haiku |
| `field_matching_prompt.md` | Match form fields to user profile data | `profile` (JSON), `form_fields` (JSON) | JSON mapping: field ID → profile path or special value | haiku |
| `my_background.md` | User's professional background (static context) | N/A (user-edited content) | Used as context input for `why_company_prompt.md` | N/A |

### Special Values for Field Matching

The `field_matching_prompt.md` can return these special values:

- **Profile paths**: e.g., `"personal.first_name"`, `"personal.email"`
- **`RESUME_UPLOAD`**: Resume/CV file upload fields
- **`COVER_LETTER`**: Why this company/role, motivation statement fields
- **`FREEFORM_ANSWER`**: Open-ended questions needing written response
- **`SPECIFIC_QUESTION`**: Answerable questions not in profile (e.g., salary, notice period)
- **`SKIP`**: Demographic/EEO fields user should review themselves
- **`UNKNOWN`**: Cannot determine, needs human review

## Model Configuration

Models are assigned to prompts in `config.json` under `task_models`:

```json
{
  "task_models": {
    "address_lookup": "haiku",
    "company_research": "sonnet",
    "why_paragraph": "sonnet",
    "style_rewrite": "haiku",
    "field_matching": "haiku"
  }
}
```

- **Haiku**: Fast, cheap model for simple tasks (address lookup, style rewrite, field matching)
- **Sonnet**: Balanced model for complex reasoning (company research, paragraph generation)
- **Opus**: Best quality (currently unused, available for future use)

## Adding New Prompts

When adding a new prompt to the system:

### Checklist

- [ ] **Create prompt file**: Add `your_prompt_name.md` to `prompts/` directory
  - Use `{placeholder}` syntax for variable substitution
  - Include clear instructions for the LLM
  - Specify output format (JSON, plain text, structured text)

- [ ] **Update config.json**: Add entry to `task_models` section
  ```json
  "your_task_name": "haiku"  // or "sonnet" or "opus"
  ```

- [ ] **Update this README**:
  - Add node to Mermaid flowchart (if part of a pipeline)
  - Add row to prompt inventory table
  - Update special values section if applicable

- [ ] **Add code integration**:
  - In `generate_cover_letter.py` or `server.py`:
    - Use `load_prompt("your_prompt_name.md")`
    - Format with `.format(placeholder=value)`
    - Use `get_model_id("your_task_name")` to get model
    - Call Anthropic API with formatted prompt

- [ ] **Test the prompt**:
  - Verify placeholder substitution works
  - Check LLM response format matches expectations
  - Validate error handling for malformed responses

### Example: Adding a New Prompt

```python
# In server.py or generate_cover_letter.py

# 1. Load the prompt
prompt_template = load_prompt("your_prompt_name.md")

# 2. Format with variables
prompt = prompt_template.format(
    placeholder1=value1,
    placeholder2=value2
)

# 3. Get model from config
config, get_model_id = load_config()
model_id = get_model_id("your_task_name")

# 4. Call API
response = client.messages.create(
    model=model_id,
    max_tokens=500,
    messages=[{"role": "user", "content": prompt}]
)

# 5. Parse response
result = response.content[0].text
```

## Prompt Design Guidelines

### General Principles

1. **Be specific**: Clear, unambiguous instructions
2. **Define output format**: JSON, plain text, structured data
3. **Provide examples**: Show what good output looks like
4. **Use constraints**: Word limits, style rules, formatting requirements
5. **Handle edge cases**: What to do with missing data, ambiguous inputs

### Template Variables

Use Python `str.format()` syntax for placeholders:

```markdown
Your prompt text here with {variable_name}.

More context: {another_variable}
```

### Output Formats

**For JSON responses:**
```markdown
Return only valid JSON object, no explanation.
```

**For structured text:**
```markdown
Return in this format:
KEY1: value
KEY2: value
```

**For plain text:**
```markdown
Return a single paragraph of 3-5 sentences.
```

## Debugging Prompts

### View Prompt Before API Call

Most functions include debug output:

```python
# In generate_cover_letter.py
Path("debug_why_paragraph.txt").write_text(prompt, encoding="utf-8")
```

Check these files in the project root after running.

### Common Issues

**Problem**: LLM returns explanation instead of raw output
- **Fix**: Add "Return only [format], no explanation" to prompt

**Problem**: JSON parsing fails
- **Fix**: Use `json.loads(response.strip())` and handle JSONDecodeError

**Problem**: Missing placeholders
- **Fix**: Verify all `{placeholders}` are passed to `.format()`

**Problem**: Wrong model used
- **Fix**: Check `config.json` task_models mapping

## Maintenance

**This README should be updated when:**
- New prompts are added
- Prompt purposes change
- New special values are introduced
- Pipeline flows are modified
- Model assignments change

**Last updated**: 2026-01-13
