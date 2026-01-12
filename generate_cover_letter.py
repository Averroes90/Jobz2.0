#!/usr/bin/env python3
"""
Cover Letter Generator
Generates customized cover letters based on company research.

Usage:
    python generate_cover_letter.py "Company Name" "Job Title" [--job-url URL] [--dry-run]

Environment:
    ANTHROPIC_API_KEY - Required for API calls
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from urllib import response
from anthropic.types import TextBlock
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration
TEMPLATE_PATH = Path(__file__).parent / "template" / "cover_letter_template.docx"
OUTPUT_ROOT = Path.home() / "Documents" / "resume"
SCRIPTS_PATH = (
    Path(__file__).parent / "scripts"
)  # Will copy scripts here for portability

# Placeholder markers in the template
PLACEHOLDERS = {
    "date": "{{DATE}}",
    "company_name": "{{COMPANY_NAME}}",
    "company_address_line1": "{{COMPANY_ADDRESS_LINE1}}",
    "company_address_line2": "{{COMPANY_ADDRESS_LINE2}}",
    "role_title": "{{ROLE_TITLE}}",
    "why_company_paragraph": "{{WHY_COMPANY_PARAGRAPH}}",
}

# Prompts directory
PROMPTS_PATH = Path(__file__).parent / "prompts"

# Models configuration file
MODELS_CONFIG_PATH = Path(__file__).parent / "models.json"


def load_models_config() -> dict:
    """Load models configuration from JSON file."""
    if not MODELS_CONFIG_PATH.exists():
        raise FileNotFoundError(f"Models config not found: {MODELS_CONFIG_PATH}")
    with open(MODELS_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_prompt(filename: str) -> str:
    """Load a prompt template from the prompts/ directory."""
    prompt_path = PROMPTS_PATH / filename
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_path}")
    return prompt_path.read_text(encoding="utf-8")


def check_api_key():
    """Verify API key is set."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set.")
        print("Set it with: export ANTHROPIC_API_KEY='your-key-here'")
        sys.exit(1)


def get_company_address(company_name: str, role_location: str = "", model: str = "claude-haiku-4-5-20250514") -> dict:
    """
    Use Claude API with web search to find company headquarters address.
    Returns address info for the cover letter header.
    """
    import anthropic

    client = anthropic.Anthropic()

    # Load and format the address lookup prompt
    address_prompt = load_prompt("address_lookup_prompt.md").format(
        company_name=company_name,
        role_location_if_known=role_location,
    )

    response = client.messages.create(
        model=model,
        max_tokens=500,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[{"role": "user", "content": address_prompt}],
    )

    # Extract text from response
    full_text = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            full_text += block.text

    # Parse the response
    result = {
        "address_line1": f"{company_name} Hiring Team",
        "address_line2": "",
    }

    # Try to extract structured address
    if "ADDRESS_LINE1:" in full_text:
        match = re.search(r"ADDRESS_LINE1:\s*(.+?)(?:\n|$)", full_text)
        if match:
            result["address_line1"] = match.group(1).strip()

    if "ADDRESS_LINE2:" in full_text:
        match = re.search(r"ADDRESS_LINE2:\s*(.+?)(?:\n|$)", full_text)
        if match:
            result["address_line2"] = match.group(1).strip()

    return result


def get_company_context(
    company_name: str, role_title: str, job_description: str = "", model: str = "claude-sonnet-4-20250514"
) -> dict:
    """
    Use Claude API with web search to research the company.
    Returns company context for generating the "why" paragraph.
    """
    import anthropic

    client = anthropic.Anthropic()

    # Format job description section
    job_desc_section = ""
    if job_description:
        job_desc_section = f"\nJob Description:\n{job_description}"

    # Load and format the company research prompt
    research_prompt = load_prompt("company_research_prompt.md").format(
        company_name=company_name,
        role_title=role_title,
        job_description=job_desc_section,
    )

    response = client.messages.create(
        model=model,
        max_tokens=2000,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[{"role": "user", "content": research_prompt}],
    )

    # Extract text from response
    full_text = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            full_text += block.text

    return {"company_context": full_text}


def generate_why_paragraph(
    company_name: str,
    role_title: str,
    company_context: str,
    job_description: str = "",
    custom_prompt: str | None = None,
    model: str = "claude-sonnet-4-20250514",
) -> str:
    """
    Generate the "I want to work at X because..." paragraph.
    Uses the company research context, job description, and optional custom instructions.
    """
    import anthropic

    client = anthropic.Anthropic()

    # Load background and prompt templates
    my_background = load_prompt("my_background.md")

    # Use custom prompt if provided, otherwise use default template
    if custom_prompt:
        prompt = custom_prompt
    else:
        prompt = load_prompt("why_company_prompt.md").format(
            company_name=company_name,
            role_title=role_title,
            company_context=company_context,
            my_background=my_background,
            job_description=job_description,
        )

    response = client.messages.create(
        model=model,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )

    block = response.content[0]
    if isinstance(block, TextBlock):
        return block.text.strip()
    return ""


def create_cover_letter(
    company_name: str,
    role_title: str,
    address_line1: str,
    address_line2: str,
    why_paragraph: str,
    output_path: Path,
    dry_run: bool = False,
) -> Path:
    """
    Create a new cover letter by modifying the template.
    Uses unpack -> XML edit -> repack approach.
    """
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Template not found at {TEMPLATE_PATH}")

    # Format date
    today = datetime.now()
    date_str = today.strftime("%B %d, %Y")  # e.g., "January 05, 2026"

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        unpacked_dir = tmpdir / "unpacked"

        # Unpack template
        subprocess.run(
            [
                "python",
                str(SCRIPTS_PATH / "unpack.py"),
                str(TEMPLATE_PATH),
                str(unpacked_dir),
            ],
            check=True,
            capture_output=True,
        )

        # Read document.xml
        doc_xml_path = unpacked_dir / "word" / "document.xml"
        with open(doc_xml_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Replace placeholders
        replacements = {
            PLACEHOLDERS["date"]: date_str,
            PLACEHOLDERS["company_name"]: f"{company_name} hiring team",
            PLACEHOLDERS["company_address_line1"]: address_line1,
            PLACEHOLDERS["company_address_line2"]: address_line2,
            PLACEHOLDERS["role_title"]: f"{role_title} role at {company_name}",
            PLACEHOLDERS["why_company_paragraph"]: why_paragraph,
        }

        for placeholder, value in replacements.items():
            content = content.replace(placeholder, value)

        if dry_run:
            print("\n--- DRY RUN: Would create document with these values ---")
            for key, value in replacements.items():
                print(f"{key}: {value[:100]}{'...' if len(value) > 100 else ''}")
            return output_path

        # Write modified XML
        with open(doc_xml_path, "w", encoding="utf-8") as f:
            f.write(content)

        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Repack
        subprocess.run(
            [
                "python",
                str(SCRIPTS_PATH / "pack.py"),
                str(unpacked_dir),
                str(output_path),
                "--original",
                str(TEMPLATE_PATH),
            ],
            check=True,
            capture_output=True,
        )

    return output_path


def main():
    # Load models configuration
    models_config = load_models_config()
    available_models = list(models_config["models"].keys())
    default_model = models_config.get("default_model", "haiku")

    # Build model descriptions for help text
    model_descriptions = ", ".join([
        f"{name} ({models_config['models'][name]['description']})"
        for name in available_models
    ])

    parser = argparse.ArgumentParser(description="Generate customized cover letters")
    parser.add_argument("company", help="Company name")
    parser.add_argument("role", help="Job title/role")
    parser.add_argument(
        "--job-description", help="Job description text (optional)"
    )
    parser.add_argument(
        "--job-desc-file", type=Path, help="File containing job description"
    )
    parser.add_argument(
        "--custom-prompt", help="Custom instructions for the 'why' paragraph"
    )
    parser.add_argument(
        "--custom-prompt-file", type=Path, help="File containing custom instructions"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Preview without creating file"
    )
    parser.add_argument(
        "--output-dir", type=Path, default=OUTPUT_ROOT, help="Output directory root"
    )
    parser.add_argument(
        "--role-location", help="Role location (e.g., 'San Francisco', 'Remote')"
    )
    parser.add_argument(
        "--model",
        choices=available_models,
        default=default_model,
        help=f"Model to use for API calls: {model_descriptions}",
    )
    parser.add_argument(
        "--delay",
        type=int,
        default=5,
        help="Delay in seconds between API calls to avoid rate limiting (default: 5)",
    )
    parser.add_argument(
        "--skip-research",
        action="store_true",
        help="Skip web research (use manual address and no company context)",
    )
    parser.add_argument("--address1", help="Manual address line 1")
    parser.add_argument("--address2", help="Manual address line 2")

    args = parser.parse_args()

    check_api_key()

    # Get model configuration
    model_config = models_config["models"][args.model]
    model_id = model_config["model_id"]
    provider = model_config["provider"]
    print(f"Using model: {args.model} ({provider}: {model_id})")

    # Load custom prompt from file if specified
    custom_prompt = args.custom_prompt
    if args.custom_prompt_file and args.custom_prompt_file.exists():
        custom_prompt = args.custom_prompt_file.read_text()

    # Load job description from file if specified
    job_description = args.job_description or ""
    if args.job_desc_file and args.job_desc_file.exists():
        job_description = args.job_desc_file.read_text()

    # Get company address and context (or use manual values)
    if args.skip_research:
        address = {
            "address_line1": args.address1 or f"{args.company} Hiring Team",
            "address_line2": args.address2 or "",
        }
        company_context = ""
        print(f"Skipping research, using provided/default address")
    else:
        # Get company address
        print(f"Looking up address for {args.company}...")
        role_location = args.role_location or ""
        address = get_company_address(args.company, role_location, model_id)
        print(f"Found address: {address['address_line1']}, {address['address_line2']}")
        time.sleep(args.delay)  # Rate limiting between API calls

        # Get company context
        print(f"Researching {args.company}...")
        context_result = get_company_context(args.company, args.role, job_description, model_id)
        company_context = context_result["company_context"]
        time.sleep(args.delay)  # Rate limiting between API calls

    print(f"Generating 'why {args.company}' paragraph...")
    why_paragraph = generate_why_paragraph(
        args.company,
        args.role,
        company_context,
        job_description,
        custom_prompt,
        model_id,
    )
    time.sleep(args.delay)  # Rate limiting between API calls

    print(f"\nGenerated paragraph:\n{why_paragraph}\n")

    # Build output path: applications/CompanyName/Rami_Ibrahimi_CompanyName_2026-01-05_RoleTitle.docx
    safe_company_name = re.sub(r"[^\w\s-]", "", args.company).replace(" ", "_")
    safe_role = re.sub(r"[^\w\s-]", "", args.role).replace(" ", "_")
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"Rami_Ibrahimi_{safe_company_name}_{date_str}_{safe_role}.docx"
    output_path = args.output_dir / safe_company_name / filename

    print(f"Creating cover letter at {output_path}...")
    create_cover_letter(
        company_name=args.company,
        role_title=args.role,
        address_line1=address["address_line1"],
        address_line2=address["address_line2"],
        why_paragraph=why_paragraph,
        output_path=output_path,
        dry_run=args.dry_run,
    )

    if not args.dry_run:
        print(f"\n✓ Cover letter created: {output_path}")

        # Also create/overwrite the latest active version for this company
        latest_filename = f"Ibrahimi_Rami_Cover_letter_{safe_company_name}.docx"
        latest_path = args.output_dir / safe_company_name / latest_filename
        shutil.copy2(output_path, latest_path)
        print(f"✓ Latest version updated: {latest_path}")


if __name__ == "__main__":
    main()
