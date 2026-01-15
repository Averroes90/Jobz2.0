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
import anthropic
from anthropic.types import TextBlock
from dotenv import load_dotenv
from utils import TokenTracker, track_api_call
from utils.cache import ResearchCache

# Load environment variables from .env file
load_dotenv()

# Global token tracker and research cache
tracker = TokenTracker()
research_cache = ResearchCache()

# Configuration paths
TEMPLATE_PATH = Path(__file__).parent / "template" / "cover_letter_template.docx"
SCRIPTS_PATH = Path(__file__).parent / "scripts"
CONFIG_PATH = Path(__file__).parent / "config.json"

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


def load_config():
    """Load application configuration from JSON file.

    Returns:
        tuple: (config dict, get_model_id function)
    """
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Config file not found: {CONFIG_PATH}")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)
    # Expand home directory in output path
    if "output" in config and "root_directory" in config["output"]:
        config["output"]["root_directory"] = str(
            Path(config["output"]["root_directory"]).expanduser()
        )

    def get_model_id(task_name: str, model_override: str | None = None) -> str:
        """Get model ID for a given task name.

        Args:
            task_name: Task name (e.g., "address_lookup", "company_research")
            model_override: Optional model name to override task default

        Returns:
            str: Full model ID (e.g., "claude-haiku-4-5-20250514")
        """
        model_name = (
            model_override if model_override else config["task_models"][task_name]
        )
        return config["model_definitions"][model_name]["model_id"]

    return config, get_model_id


def call_with_retry(api_call_func, max_retries=3, wait_seconds=90):
    """Execute API call with retry logic for rate limits."""
    for attempt in range(max_retries):
        try:
            return api_call_func()
        except anthropic.RateLimitError as e:
            print(
                f"Rate limit hit at {datetime.now().strftime('%H:%M:%S')}. (attempt {attempt + 1}/{max_retries})"
            )

            # Calculate exact wait time from rate limit headers
            actual_wait_seconds = wait_seconds
            reset_time_str = None

            if hasattr(e, "response") and hasattr(e.response, "headers"):
                headers = e.response.headers
                print("Rate limit headers:")
                for key, value in headers.items():
                    if "ratelimit" in key.lower() or "rate-limit" in key.lower():
                        print(f"  {key}: {value}")

                # Try to parse the reset timestamp
                reset_header = headers.get("anthropic-ratelimit-input-tokens-reset")
                if reset_header:
                    try:
                        # Parse ISO datetime format
                        reset_time = datetime.fromisoformat(
                            reset_header.replace("Z", "+00:00")
                        )
                        now = datetime.now(reset_time.tzinfo)

                        # Calculate seconds until reset (add 1 second buffer)
                        seconds_until_reset = (reset_time - now).total_seconds() + 1

                        if seconds_until_reset > 0:
                            actual_wait_seconds = int(seconds_until_reset)
                            reset_time_str = reset_time.strftime("%H:%M:%S")
                        else:
                            # Reset time is in the past, use default
                            print(
                                f"Warning: Reset time is in the past, using default wait time"
                            )
                    except Exception as parse_error:
                        print(f"Warning: Could not parse reset time: {parse_error}")
                        # Fall back to default wait_seconds

            if attempt < max_retries - 1:
                if reset_time_str:
                    print(
                        f"Rate limit hit. Waiting {actual_wait_seconds}s until {reset_time_str}..."
                    )
                else:
                    print(f"Waiting {actual_wait_seconds}s...")
                time.sleep(actual_wait_seconds)
                print(f"Resuming at {datetime.now().strftime('%H:%M:%S')}")
            else:
                print(f"Rate limit still hit after {max_retries} attempts. Giving up.")
                raise


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


def get_company_address(
    company_name: str,
    role_location: str = "",
    model: str | None = None,
    config: dict | None = None,
) -> dict:
    """
    Use Claude API with web search to find company headquarters address.
    Returns address info for the cover letter header.
    """
    if config is None:
        config, get_model_id_fn = load_config()
        if model is None:
            model = get_model_id_fn("address_lookup")
    elif model is None:
        # config is provided but model is not, need to get model_id
        _, get_model_id_fn = load_config()
        model = get_model_id_fn("address_lookup")

    client = anthropic.Anthropic()

    # Load and format the address lookup prompt
    address_prompt = load_prompt("address_lookup_prompt.md").format(
        company_name=company_name,
        role_location_if_known=role_location,
    )

    response = call_with_retry(
        lambda: client.messages.create(
            model=model,
            max_tokens=500,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{"role": "user", "content": address_prompt}],
        ),
        max_retries=config["api_settings"]["retry_attempts"],
        wait_seconds=config["api_settings"]["retry_wait_seconds"],
    )

    # Track API usage
    track_api_call(tracker, "address_lookup", model, response)

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


def search_company_info(
    company_name: str,
    role_title: str,
    model: str | None = None,
    config: dict | None = None,
) -> str:
    """
    Phase 1: Use Haiku with web search to gather raw facts about the company.
    Returns raw facts as a string.
    """
    if config is None:
        config, get_model_id_fn = load_config()
        if model is None:
            model = get_model_id_fn("company_research_search")
    elif model is None:
        # config is provided but model is not, need to get model_id
        _, get_model_id_fn = load_config()
        model = get_model_id_fn("company_research_search")

    client = anthropic.Anthropic()

    # Load and format the search prompt
    search_prompt = load_prompt("company_research_search_prompt.md").format(
        company_name=company_name,
        role_title=role_title,
    )

    response = call_with_retry(
        lambda: client.messages.create(
            model=model,
            max_tokens=2000,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{"role": "user", "content": search_prompt}],
        ),
        max_retries=config["api_settings"]["retry_attempts"],
        wait_seconds=config["api_settings"]["retry_wait_seconds"],
    )

    # Track API usage
    track_api_call(tracker, "company_research_search", model, response)

    # Extract text from response
    raw_facts = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            raw_facts += block.text

    return raw_facts


def synthesize_company_context(
    company_name: str,
    role_title: str,
    raw_facts: str,
    job_description: str = "",
    model: str | None = None,
    config: dict | None = None,
) -> dict:
    """
    Phase 2: Use Sonnet to synthesize raw facts into structured context.
    No web search - just processing text.
    Returns structured context dict.
    """
    if config is None:
        config, get_model_id_fn = load_config()
        if model is None:
            model = get_model_id_fn("company_research_synthesize")
    elif model is None:
        # config is provided but model is not, need to get model_id
        _, get_model_id_fn = load_config()
        model = get_model_id_fn("company_research_synthesize")

    client = anthropic.Anthropic()

    # Load and format the synthesize prompt
    synthesize_prompt = load_prompt("company_research_synthesize_prompt.md").format(
        company_name=company_name,
        role_title=role_title,
        raw_facts=raw_facts,
        job_description=job_description or "Not provided",
    )

    response = call_with_retry(
        lambda: client.messages.create(
            model=model,
            max_tokens=1000,
            messages=[{"role": "user", "content": synthesize_prompt}],
        ),
        max_retries=config["api_settings"]["retry_attempts"],
        wait_seconds=config["api_settings"]["retry_wait_seconds"],
    )

    # Track API usage
    track_api_call(tracker, "company_research_synthesize", model, response)

    # Extract text from response
    context_text = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            context_text += block.text

    return {"company_context": context_text}


def get_company_context(
    company_name: str,
    role_title: str,
    job_description: str = "",
    model: str | None = None,
    config: dict | None = None,
) -> dict:
    """
    Two-phase company research with caching:
    1. Check cache first (7-day expiry)
    2. If not cached: Search for raw facts using Haiku + web search (cheap)
    3. If not cached: Synthesize facts into context using Sonnet (focused)
    4. Cache the result for future use

    Returns company context for generating the "why" paragraph.
    """
    # Check cache first
    cached = research_cache.get(company_name)
    if cached:
        print(f"✓ Using cached research for {company_name}")
        return cached

    print(f"Researching {company_name}...")

    # Phase 1: Search for raw facts
    raw_facts = search_company_info(
        company_name=company_name,
        role_title=role_title,
        config=config,
    )

    # Phase 2: Synthesize into structured context
    result = synthesize_company_context(
        company_name=company_name,
        role_title=role_title,
        raw_facts=raw_facts,
        job_description=job_description,
        config=config,
    )

    # Cache for future use
    research_cache.set(company_name, result)

    return result


def generate_why_paragraph(
    company_name: str,
    role_title: str,
    company_context: str,
    job_description: str = "",
    custom_prompt: str | None = None,
    model: str | None = None,
    config: dict | None = None,
) -> str:
    """
    Generate the "I want to work at X because..." paragraph.
    Uses the company research context, job description, and optional custom instructions.
    """
    if config is None:
        config, get_model_id_fn = load_config()
        if model is None:
            model = get_model_id_fn("why_paragraph")
    elif model is None:
        # config is provided but model is not, need to get model_id
        _, get_model_id_fn = load_config()
        model = get_model_id_fn("why_paragraph")

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

    # Debug: dump all inputs before API call
    debug_output = f"""
=== WHY PARAGRAPH API CALL DEBUG ===
Timestamp: {datetime.now().isoformat()}

company_name: {company_name}
role_title: {role_title}

my_background length: {len(my_background)} chars
company_context length: {len(company_context)} chars
job_description length: {len(job_description)} chars
prompt length: {len(prompt)} chars

=== FULL PROMPT BEING SENT ===
{prompt}

=== END DEBUG ===
"""
    Path("debug_why_paragraph.txt").write_text(debug_output, encoding="utf-8")
    print(f"Debug: Why paragraph inputs saved to debug_why_paragraph.txt")

    response = call_with_retry(
        lambda: client.messages.create(
            model=model,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        ),
        max_retries=config["api_settings"]["retry_attempts"],
        wait_seconds=config["api_settings"]["retry_wait_seconds"],
    )

    # Track API usage
    track_api_call(tracker, "why_paragraph", model, response)

    block = response.content[0]
    if isinstance(block, TextBlock):
        return block.text.strip()
    return ""


def rewrite_for_style(
    paragraph: str,
    model: str | None = None,
    config: dict | None = None,
) -> str:
    """
    Rewrite a paragraph for better style and readability.
    Uses Haiku model for fast, simple rewrites without web search.
    """
    if config is None:
        config, get_model_id_fn = load_config()
        if model is None:
            model = get_model_id_fn("style_rewrite")
    elif model is None:
        # config is provided but model is not, need to get model_id
        _, get_model_id_fn = load_config()
        model = get_model_id_fn("style_rewrite")

    client = anthropic.Anthropic()

    # Load style rewrite prompt
    prompt_template = load_prompt("style_rewrite_prompt.md")
    prompt = prompt_template.format(paragraph=paragraph)

    response = call_with_retry(
        lambda: client.messages.create(
            model=model,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        ),
        max_retries=config["api_settings"]["retry_attempts"],
        wait_seconds=config["api_settings"]["retry_wait_seconds"],
    )

    # Track API usage
    track_api_call(tracker, "style_rewrite", model, response)

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

        # Note: We keep the ---BODY--- marker in the document so that
        # extract_cover_letter_text() can use it to identify where the body starts.
        # The marker is removed from the extracted text, not the DOCX file.

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


def extract_cover_letter_text(docx_path: str) -> str:
    """Extract plain text from a .docx file using pandoc.

    If the ---BODY--- marker exists in the text, returns only the content
    after the marker. Otherwise returns the full text.

    Args:
        docx_path: Path to the .docx file

    Returns:
        Text content of the document (body only if marker exists)
    """
    docx_file = Path(docx_path)

    if not docx_file.exists():
        raise FileNotFoundError(f"DOCX file not found: {docx_path}")

    try:
        # Use pandoc to extract plain text
        result = subprocess.run(
            ["pandoc", str(docx_file), "-t", "plain", "-o", "-"],
            capture_output=True,
            text=True,
            check=True,
        )

        full_text = result.stdout.strip()

        # If marker exists, return only content after it
        if "---BODY---" in full_text:
            # Split on marker and get everything after it
            parts = full_text.split("---BODY---", 1)
            body_text = parts[1].lstrip()  # Strip leading whitespace
            return body_text
        else:
            # No marker, return full text
            return full_text

    except subprocess.CalledProcessError as e:
        raise Exception(
            f"Failed to extract text from {docx_path} using pandoc: {e.stderr}"
        )
    except Exception as e:
        raise Exception(f"Failed to extract text from {docx_path}: {e}")


def run_pipeline(
    company_name: str,
    role_title: str,
    job_description: str = "",
    role_location: str = "",
    custom_prompt: str = "",
    model_override: str | None = None,
    delay: int = 5,
    skip_research: bool = False,
    manual_address1: str = "",
    manual_address2: str = "",
    output_dir: Path | None = None,
    dry_run: bool = False,
) -> dict:
    """
    Run the cover letter generation pipeline.

    Args:
        company_name: Company name
        role_title: Job title/role
        job_description: Job description text (optional)
        role_location: Role location (e.g., "San Francisco", "Remote")
        custom_prompt: Custom instructions for the 'why' paragraph
        model_override: Model name to use for all tasks (overrides config defaults)
        delay: Delay in seconds between API calls (default: 5)
        skip_research: Skip web research and use manual address
        manual_address1: Manual address line 1 (used with skip_research)
        manual_address2: Manual address line 2 (used with skip_research)
        output_dir: Output directory root (defaults to config value)
        dry_run: Preview without creating files

    Returns:
        dict: {
            "paragraph": str,           # Final generated paragraph
            "docx_path": str,           # Path to timestamped docx
            "latest_docx_path": str,    # Path to latest version docx
            "address": dict,            # {"address_line1": str, "address_line2": str}
            "company_context": str      # Research context (empty if skip_research)
        }
    """
    # Load configuration
    config, get_model_id = load_config()

    # Use output directory from config if not provided
    if output_dir is None:
        output_dir = Path(config["output"]["root_directory"])

    # Get company address and context (or use manual values)
    if skip_research:
        address = {
            "address_line1": manual_address1 or f"{company_name} Hiring Team",
            "address_line2": manual_address2 or "",
        }
        company_context = ""
        print(f"Skipping research, using provided/default address")
    else:
        # Get company address
        print(f"Looking up address for {company_name}...")
        address_model_id = get_model_id("address_lookup", model_override)
        address = get_company_address(
            company_name, role_location, address_model_id, config
        )
        print(f"Found address: {address['address_line1']}, {address['address_line2']}")

        # Get company context
        print(f"Researching {company_name}...")
        research_model_id = get_model_id("company_research", model_override)
        context_result = get_company_context(
            company_name, role_title, job_description, research_model_id, config
        )
        company_context = context_result["company_context"]

        # Debug: write company context to file
        Path("debug_context.txt").write_text(company_context, encoding="utf-8")
        print(f"Debug: Company context saved to debug_context.txt")

    # Generate why paragraph
    print(f"Generating 'why {company_name}' paragraph...")
    paragraph_model_id = get_model_id("why_paragraph", model_override)
    why_paragraph = generate_why_paragraph(
        company_name,
        role_title,
        company_context,
        job_description,
        custom_prompt,
        paragraph_model_id,
        config,
    )

    print(f"\nGenerated paragraph:\n{why_paragraph}\n")

    # Rewrite for style
    time.sleep(delay)
    print(f"Rewriting for style...")
    style_model_id = get_model_id("style_rewrite", model_override)
    final_paragraph = rewrite_for_style(why_paragraph, style_model_id, config)
    print(f"\nFinal paragraph:\n{final_paragraph}\n")

    # Build output path: applications/CompanyName/FilenamePrefix_CompanyName_2026-01-05_RoleTitle.docx
    filename_prefix = config["output"]["filename_prefix"]
    safe_company_name = re.sub(r"[^\w\s-]", "", company_name).replace(" ", "_")
    safe_role = re.sub(r"[^\w\s-]", "", role_title).replace(" ", "_")
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"{filename_prefix}_{safe_company_name}_{date_str}_{safe_role}.docx"
    output_path = output_dir / safe_company_name / filename

    # Create cover letter
    print(f"Creating cover letter at {output_path}...")
    create_cover_letter(
        company_name=company_name,
        role_title=role_title,
        address_line1=address["address_line1"],
        address_line2=address["address_line2"],
        why_paragraph=final_paragraph,
        output_path=output_path,
        dry_run=dry_run,
    )

    # Create latest version
    latest_path = None
    if not dry_run:
        print(f"\n✓ Cover letter created: {output_path}")

        # Also create/overwrite the latest active version for this company
        latest_filename = f"{filename_prefix}_Cover_letter_{safe_company_name}.docx"
        latest_path = output_dir / safe_company_name / latest_filename
        shutil.copy2(output_path, latest_path)
        print(f"✓ Latest version updated: {latest_path}")

    # Export token usage log and print summary
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    tracker.export_log(f"logs/token_usage_{timestamp}.log")
    tracker.print_summary()

    # Extract body text from the generated cover letter
    try:
        body_text = extract_cover_letter_text(str(output_path))
        print(f"✓ Extracted {len(body_text)} characters of body text")
    except Exception as e:
        print(f"Warning: Could not extract body text: {e}")
        body_text = final_paragraph  # Fallback to just the paragraph

    # Return results
    return {
        "paragraph": final_paragraph,
        "body_text": body_text,
        "docx_path": str(output_path),
        "latest_docx_path": str(latest_path) if latest_path else None,
        "address": address,
        "company_context": company_context,
    }


def main():
    # Load configurations
    config, get_model_id = load_config()
    available_models = list(config["model_definitions"].keys())

    # Build model descriptions for help text
    model_descriptions = ", ".join(
        [
            f"{name} ({config['model_definitions'][name]['description']})"
            for name in available_models
        ]
    )

    # Get output directory from config
    output_root = Path(config["output"]["root_directory"])

    parser = argparse.ArgumentParser(description="Generate customized cover letters")
    parser.add_argument("company", help="Company name")
    parser.add_argument("role", help="Job title/role")
    parser.add_argument("--job-description", help="Job description text (optional)")
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
        "--output-dir", type=Path, default=output_root, help="Output directory root"
    )
    parser.add_argument(
        "--role-location", help="Role location (e.g., 'San Francisco', 'Remote')"
    )
    parser.add_argument(
        "--model",
        choices=available_models,
        default=None,
        help=f"Model to use for all API calls (overrides task-specific defaults): {model_descriptions}",
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

    # Display model configuration
    if args.model:
        print(f"Using model override: {args.model} for all tasks")
    else:
        print("Using task-specific models from config")

    # Load custom prompt from file if specified
    custom_prompt = args.custom_prompt or ""
    if args.custom_prompt_file and args.custom_prompt_file.exists():
        custom_prompt = args.custom_prompt_file.read_text()

    # Load job description from file if specified
    job_description = args.job_description or ""
    if args.job_desc_file and args.job_desc_file.exists():
        job_description = args.job_desc_file.read_text()

    # Run the pipeline
    run_pipeline(
        company_name=args.company,
        role_title=args.role,
        job_description=job_description,
        role_location=args.role_location or "",
        custom_prompt=custom_prompt,
        model_override=args.model,
        delay=args.delay,
        skip_research=args.skip_research,
        manual_address1=args.address1 or "",
        manual_address2=args.address2 or "",
        output_dir=args.output_dir,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
