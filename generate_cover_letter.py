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
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

# Configuration
TEMPLATE_PATH = Path(__file__).parent / "template" / "cover_letter_template.docx"
OUTPUT_ROOT = Path(__file__).parent / "applications"
SCRIPTS_PATH = Path(__file__).parent / "scripts"  # Will copy scripts here for portability

# Placeholder markers in the template
PLACEHOLDERS = {
    "date": "{{DATE}}",
    "company_name": "{{COMPANY_NAME}}",
    "company_address_line1": "{{COMPANY_ADDRESS_LINE1}}",
    "company_address_line2": "{{COMPANY_ADDRESS_LINE2}}",
    "role_title": "{{ROLE_TITLE}}",
    "why_company_paragraph": "{{WHY_COMPANY_PARAGRAPH}}",
}


def check_api_key():
    """Verify API key is set."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set.")
        print("Set it with: export ANTHROPIC_API_KEY='your-key-here'")
        sys.exit(1)


def get_company_research(company_name: str, role_title: str, job_url: str | None = None) -> dict:
    """
    Use Claude API with web search to research the company.
    Returns company info including address and context for the "why" paragraph.
    """
    import anthropic
    client = anthropic.Anthropic()
    
    job_context = ""
    if job_url:
        job_context = f"\nJob posting URL: {job_url}"
    
    research_prompt = f"""Research {company_name} for a job application to their {role_title} position.{job_context}

I need the following information:

1. **Company headquarters address** - Find the main office or headquarters address. Format as:
   - address_line1: Street address (e.g., "548 Market St,")
   - address_line2: City, State ZIP (e.g., "San Francisco, CA 94104")
   
2. **Company context for cover letter** - Research what makes this company unique:
   - What are their main products/services?
   - What is their mission or what problems do they solve?
   - Any recent news, launches, or initiatives?
   - What is their culture or values?
   - What would be compelling reasons someone would want to work there?

Return your findings in this exact format:

ADDRESS_LINE1: [street address with comma]
ADDRESS_LINE2: [city, state zip]

COMPANY_CONTEXT:
[Detailed notes about the company - 3-5 paragraphs of research findings that would help write a compelling "why I want to work here" paragraph]
"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[{"role": "user", "content": research_prompt}]
    )
    
    # Extract text from response
    full_text = ""
    for block in response.content:
        if hasattr(block, "text"):
            full_text += block.text
    
    # Parse the response
    result = {
        "address_line1": f"{company_name} Hiring Team",
        "address_line2": "",
        "company_context": full_text,
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
    
    if "COMPANY_CONTEXT:" in full_text:
        match = re.search(r"COMPANY_CONTEXT:\s*(.+)", full_text, re.DOTALL)
        if match:
            result["company_context"] = match.group(1).strip()
    
    return result


def generate_why_paragraph(
    company_name: str, 
    role_title: str, 
    company_context: str,
    custom_prompt: str | None = None
) -> str:
    """
    Generate the "I want to work at X because..." paragraph.
    Uses the company research context and optional custom instructions.
    """
    import anthropic
    client = anthropic.Anthropic()
    
    # Default prompt style - you can customize this
    base_instructions = custom_prompt or """
Write a paragraph for my cover letter explaining why I want to work at this company.

Style guidelines:
- Start with "I want to work at [Company] because..."  
- Be specific about the company - reference their actual products, mission, or recent work
- Connect my background to what they do (I have experience in operations, supply chain, product, and AI/ML)
- Show I've done my homework without being sycophantic
- Keep it authentic and conversational, not corporate-speak
- 4-6 sentences, punchy and direct
- No generic statements that could apply to any company
"""
    
    prompt = f"""Company: {company_name}
Role: {role_title}

Company Research:
{company_context}

{base_instructions}

Write only the paragraph, nothing else.
"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}]
    )
    
    return response.content[0].text.strip()


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
            ["python", str(SCRIPTS_PATH / "unpack.py"), str(TEMPLATE_PATH), str(unpacked_dir)],
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
            ["python", str(SCRIPTS_PATH / "pack.py"), str(unpacked_dir), str(output_path), 
             "--original", str(TEMPLATE_PATH)],
            check=True,
            capture_output=True,
        )
    
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Generate customized cover letters")
    parser.add_argument("company", help="Company name")
    parser.add_argument("role", help="Job title/role")
    parser.add_argument("--job-url", help="URL to job posting (optional)")
    parser.add_argument("--custom-prompt", help="Custom instructions for the 'why' paragraph")
    parser.add_argument("--custom-prompt-file", type=Path, help="File containing custom instructions")
    parser.add_argument("--dry-run", action="store_true", help="Preview without creating file")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_ROOT, help="Output directory root")
    parser.add_argument("--skip-research", action="store_true", help="Skip web research (use manual address)")
    parser.add_argument("--address1", help="Manual address line 1")
    parser.add_argument("--address2", help="Manual address line 2")
    
    args = parser.parse_args()
    
    check_api_key()
    
    # Load custom prompt from file if specified
    custom_prompt = args.custom_prompt
    if args.custom_prompt_file and args.custom_prompt_file.exists():
        custom_prompt = args.custom_prompt_file.read_text()
    
    # Get company research (or use manual values)
    if args.skip_research:
        research = {
            "address_line1": args.address1 or f"{args.company}",
            "address_line2": args.address2 or "",
            "company_context": "",
        }
        print(f"Skipping research, using provided address")
    else:
        print(f"Researching {args.company}...")
        research = get_company_research(args.company, args.role, args.job_url)
        print(f"Found address: {research['address_line1']}, {research['address_line2']}")
    
    print(f"Generating 'why {args.company}' paragraph...")
    why_paragraph = generate_why_paragraph(
        args.company,
        args.role,
        research["company_context"],
        custom_prompt,
    )
    
    print(f"\nGenerated paragraph:\n{why_paragraph}\n")
    
    # Build output path: applications/CompanyName/Rami_Ibrahimi_2026-01-05_CompanyName.docx
    safe_company_name = re.sub(r"[^\w\s-]", "", args.company).replace(" ", "_")
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"Rami_Ibrahimi_{date_str}_{safe_company_name}.docx"
    output_path = args.output_dir / safe_company_name / filename
    
    print(f"Creating cover letter at {output_path}...")
    create_cover_letter(
        company_name=args.company,
        role_title=args.role,
        address_line1=research["address_line1"],
        address_line2=research["address_line2"],
        why_paragraph=why_paragraph,
        output_path=output_path,
        dry_run=args.dry_run,
    )
    
    if not args.dry_run:
        print(f"\n✓ Cover letter created: {output_path}")


if __name__ == "__main__":
    main()
