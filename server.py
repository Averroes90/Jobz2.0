#!/usr/bin/env python3
"""
Flask server for job application form field matching.
Receives form field data from browser extension and returns matched/filled values.
"""

import json
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import anthropic
from anthropic.types import TextBlock
from generate_cover_letter import run_pipeline, extract_cover_letter_text
from utils import TokenTracker, track_api_call, PrettyLogger

# Load environment variables
load_dotenv()

# Global token tracker and logger
tracker = TokenTracker()
logger = PrettyLogger(filename="server.log")

app = Flask(__name__)

# Enable CORS for browser extension access (permissive for development)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Add explicit CORS headers for all responses
@app.after_request
def after_request(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Max-Age'] = '3600'
    return response

# Paths
CONFIG_PATH = Path(__file__).parent / "config.json"
PROFILE_PATH = Path(__file__).parent / "user-data" / "profile.json"
PROMPTS_PATH = Path(__file__).parent / "prompts"


def load_config():
    """Load application configuration from JSON file."""
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Config file not found: {CONFIG_PATH}")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_profile():
    """Load user profile data from JSON file."""
    if not PROFILE_PATH.exists():
        raise FileNotFoundError(f"Profile file not found: {PROFILE_PATH}")
    with open(PROFILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_prompt(filename: str) -> str:
    """Load a prompt template from the prompts/ directory."""
    prompt_path = PROMPTS_PATH / filename
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_path}")
    return prompt_path.read_text(encoding="utf-8")


def get_resume_path() -> str | None:
    """
    Find the user's resume file.

    Reads config.json to get user_data_directory, then looks in
    {user_data_directory}/resume/ for .pdf or .docx files.

    Returns:
        Path to the first resume found, or None if not found
    """
    try:
        # Load config to get user_data_directory
        config = load_config()
        user_data_dir = config.get("user_data_directory", "./user-data")

        # Expand paths like ./user-data or ~/Documents
        user_data_path = Path(user_data_dir).expanduser().resolve()
        resume_dir = user_data_path / "resume"

        # Check if resume directory exists
        if not resume_dir.exists() or not resume_dir.is_dir():
            print(f"Resume directory not found: {resume_dir}")
            return None

        # Look for .pdf or .docx files
        for extension in [".pdf", ".docx"]:
            for resume_file in resume_dir.glob(f"*{extension}"):
                if resume_file.is_file():
                    print(f"Found resume: {resume_file}")
                    return str(resume_file)

        print(f"No resume files (.pdf or .docx) found in {resume_dir}")
        return None

    except Exception as e:
        print(f"Error finding resume: {e}")
        return None


def generate_freeform_answer(question: str, company_context: str = "", config: dict | None = None) -> str:
    """
    Generate an answer to a freeform job application question.

    Args:
        question: The question text (usually from field label)
        company_context: Research context about the company (optional)
        config: Application configuration (will load if not provided)

    Returns:
        Answer text (2-4 sentences)
    """
    if config is None:
        config = load_config()

    client = anthropic.Anthropic()

    # Get the model for freeform answers
    model_name = config["task_models"]["freeform_answer"]
    model_id = config["model_definitions"][model_name]["model_id"]

    # Load background and prompt templates
    my_background = load_prompt("my_background.md")
    prompt_template = load_prompt("freeform_answer_prompt.md")

    # Format the prompt
    prompt = prompt_template.format(
        question=question,
        my_background=my_background,
        company_context=company_context
    )

    print(f"Generating freeform answer for: {question[:50]}...")

    # Call the Anthropic API
    response = client.messages.create(
        model=model_id,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )

    # Track API usage
    track_api_call(tracker, "freeform_answer", model_id, response)

    # Extract text from response
    full_text = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            full_text += block.text

    answer = full_text.strip()
    print(f"Generated answer: {answer[:100]}...")
    return answer


def answer_specific_question(question: str, profile: dict, config: dict | None = None) -> str | None:
    """
    Answer a specific job application question from profile data.

    Args:
        question: The question text (usually from field label)
        profile: User profile data dictionary
        config: Application configuration (will load if not provided)

    Returns:
        Answer text (brief) if answerable from profile, None if needs human
    """
    if config is None:
        config = load_config()

    client = anthropic.Anthropic()

    # Get the model for specific questions
    model_name = config["task_models"]["specific_question"]
    model_id = config["model_definitions"][model_name]["model_id"]

    # Load prompt template
    prompt_template = load_prompt("specific_question_prompt.md")

    # Format the prompt with question and profile (as JSON)
    prompt = prompt_template.format(
        question=question,
        profile=json.dumps(profile, indent=2)
    )

    print(f"Answering specific question: {question[:50]}...")

    # Call the Anthropic API
    response = client.messages.create(
        model=model_id,
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}]
    )

    # Track API usage
    track_api_call(tracker, "specific_question", model_id, response)

    # Extract text from response
    full_text = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            full_text += block.text

    answer = full_text.strip()

    # Check if LLM returned NEEDS_HUMAN
    if answer.startswith("NEEDS_HUMAN"):
        print(f"Question needs human: {question[:50]}")
        return None

    print(f"Generated answer: {answer[:100]}...")
    return answer


def generate_application_content(
    cover_letter_text: str,
    why_paragraph: str,
    fields_to_process: list,
    field_mapping: dict,
    profile: dict,
    config: dict | None = None
) -> dict:
    """
    Batch generate answers for application fields using cover letter context.

    Args:
        cover_letter_text: The full generated cover letter body text
        why_paragraph: Just the why-company paragraph
        fields_to_process: List of dicts with {field_id, action, label, hint}
        field_mapping: The field mappings for context on what other fields contain
        profile: User profile data dictionary
        config: Application configuration (will load if not provided)

    Returns:
        Dictionary mapping field_id to answer text
    """
    if config is None:
        config = load_config()

    if not fields_to_process:
        return {}

    client = anthropic.Anthropic()

    # Get the model for application content
    model_name = config["task_models"]["application_content"]
    model_id = config["model_definitions"][model_name]["model_id"]

    # Load prompt template
    prompt_template = load_prompt("application_content_prompt.md")

    # Build fields JSON for the prompt
    fields_json = json.dumps(fields_to_process, indent=2)
    profile_json = json.dumps(profile, indent=2)
    # Include field mapping for context about what other fields will contain
    field_mapping_json = json.dumps(field_mapping, indent=2)

    # Format the prompt
    prompt = prompt_template.format(
        cover_letter_text=cover_letter_text,
        why_paragraph=why_paragraph,
        profile=profile_json,
        fields_json=fields_json,
        form_analysis=field_mapping_json
    )

    print(f"Generating content for {len(fields_to_process)} field(s)...")

    # Call the Anthropic API
    response = client.messages.create(
        model=model_id,
        max_tokens=2500,
        messages=[{"role": "user", "content": prompt}]
    )

    # Track API usage
    track_api_call(tracker, "application_content", model_id, response)

    # Extract text from response
    full_text = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            full_text += block.text

    # Parse JSON response
    try:
        # Try to extract JSON from the response
        # Sometimes LLMs wrap JSON in markdown code blocks
        response_text = full_text.strip()

        # Remove markdown code block markers if present
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        elif response_text.startswith("```"):
            response_text = response_text[3:]

        if response_text.endswith("```"):
            response_text = response_text[:-3]

        response_text = response_text.strip()

        # Parse the JSON
        answers = json.loads(response_text)

        print(f"Content generation complete: {len(answers)} answers")
        return answers

    except json.JSONDecodeError as e:
        print(f"Error parsing content generation JSON: {e}")
        print(f"Response text: {full_text[:200]}...")
        return {}


def create_profile_summary(profile: dict) -> dict:
    """
    Create a simplified profile summary showing just the structure (keys).

    Args:
        profile: Full user profile data dictionary

    Returns:
        Dictionary with profile keys structure
    """
    summary = {}
    for section, data in profile.items():
        if isinstance(data, dict):
            summary[section] = list(data.keys())
        else:
            summary[section] = type(data).__name__
    return summary


def map_form_fields(form_fields: list, profile: dict, config: dict | None = None) -> dict:
    """
    Map form fields to profile paths, values, or actions in one LLM call.

    Args:
        form_fields: List of form field objects from the extension
        profile: User profile data dictionary
        config: Application configuration (will load if not provided)

    Returns:
        Dictionary mapping field_id to profile path/value/action
    """
    if config is None:
        config = load_config()

    client = anthropic.Anthropic()

    # Get the model for form analysis
    model_name = config["task_models"]["form_analysis"]
    model_id = config["model_definitions"][model_name]["model_id"]

    # Load and format the form analysis prompt
    prompt_template = load_prompt("form_analysis_prompt.md")

    # Streamline field data - only send essential info to reduce tokens
    streamlined_fields = []
    for field in form_fields:
        field_data = {
            "id": field.get('id', ''),
            "name": field.get('name', ''),
            "label": field.get('label', ''),
            "hint": field.get('hint', ''),
            "type": field.get('type', ''),
            "input_type": field.get('input_type', ''),
            "required": field.get('required', False)
        }

        # Include options for select/radio/checkbox groups
        if field.get('options'):
            field_data['options'] = field.get('options')[:10]  # Limit to first 10 options

        streamlined_fields.append(field_data)

    # Extract custom_answers from profile for the prompt
    custom_answers = profile.get('custom_answers', {})
    custom_answers_text = json.dumps(custom_answers, indent=2) if custom_answers else "None"

    prompt = prompt_template.format(
        form_fields=json.dumps(streamlined_fields, indent=2),
        custom_answers=custom_answers_text
    )

    print(f"Mapping {len(form_fields)} field(s) using model: {model_id}")

    # Call the Anthropic API
    response = client.messages.create(
        model=model_id,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    # Track API usage
    track_api_call(tracker, "form_analysis", model_id, response)

    # Extract text from response
    full_text = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            full_text += block.text

    # Parse JSON response (strip markdown code fences if present)
    try:
        # Remove markdown code fences if present
        text = full_text.strip()
        if text.startswith('```'):
            # Remove opening fence (```json or ```)
            text = text.split('\n', 1)[1] if '\n' in text else text
            # Remove closing fence
            if text.endswith('```'):
                text = text.rsplit('```', 1)[0]
            text = text.strip()

        mapping = json.loads(text)
        print(f"Field mapping complete: {len(mapping)} entries")
        print(f"DEBUG: Field mapping keys: {list(mapping.keys())}")
        return mapping
    except json.JSONDecodeError as e:
        print(f"Error parsing field mapping JSON: {e}")
        print(f"Response text: {full_text[:200]}...")
        # Return empty mapping on parse error
        return {}




def mapping_starts_with(mapping_value, keyword: str) -> bool:
    """Check if a mapping value starts with a keyword (handles None and non-strings)."""
    return isinstance(mapping_value, str) and mapping_value.startswith(keyword)


def convert_boolean_to_option(value, field_options: list) -> str:
    """
    Convert a boolean value to match available dropdown/radio options.

    Args:
        value: The boolean value to convert
        field_options: List of option dicts with 'value' and 'text' keys

    Returns:
        The matching option value/text, or the original value if no clear match
    """
    if not isinstance(value, bool) or not field_options:
        return value

    # Extract all option values and texts (lowercase for comparison)
    option_values = [opt.get('value', '').lower() for opt in field_options]
    option_texts = [opt.get('text', '').lower() for opt in field_options]

    if value is True:
        # Look for "yes" variations
        if 'yes' in option_values:
            return next(opt['value'] for opt in field_options if opt.get('value', '').lower() == 'yes')
        if 'yes' in option_texts:
            return next(opt['value'] for opt in field_options if opt.get('text', '').lower() == 'yes')
        # Look for "true" variations
        if 'true' in option_values:
            return next(opt['value'] for opt in field_options if opt.get('value', '').lower() == 'true')
        if 'true' in option_texts:
            return next(opt['value'] for opt in field_options if opt.get('text', '').lower() == 'true')
    else:
        # Look for "no" variations
        if 'no' in option_values:
            return next(opt['value'] for opt in field_options if opt.get('value', '').lower() == 'no')
        if 'no' in option_texts:
            return next(opt['value'] for opt in field_options if opt.get('text', '').lower() == 'no')
        # Look for "false" variations
        if 'false' in option_values:
            return next(opt['value'] for opt in field_options if opt.get('value', '').lower() == 'false')
        if 'false' in option_texts:
            return next(opt['value'] for opt in field_options if opt.get('text', '').lower() == 'false')

    # No clear match, return original
    return value


def resolve_profile_values(field_mapping: dict, profile: dict, fields: list = None) -> dict:
    """
    Resolve profile paths to actual values, with smart boolean conversion for dropdowns.

    Args:
        field_mapping: Dictionary mapping field IDs to profile paths or special values
                      (e.g., {"first_name": "personal.first_name", "resume": "RESUME_UPLOAD"})
        profile: User profile data dictionary
        fields: List of field objects (optional, used for boolean-to-option conversion)

    Returns:
        Dictionary mapping field IDs to actual values from profile
        (e.g., {"first_name": "John", "email": "john@example.com"})
    """
    # Special action values that should not be resolved
    SPECIAL_ACTIONS = {
        'RESUME_UPLOAD',
        'COVER_LETTER_FULL',
        'COVER_LETTER_BODY',
        'COVER_LETTER_WHY',
        'GENERATE_ANSWER',
        'NEEDS_HUMAN',
        'ACKNOWLEDGE_TRUE',
        'SKIP',
        'UNKNOWN',
        None
    }

    # Build a map of field_id to field info for option conversion
    field_map = {}
    if fields:
        for field in fields:
            # Use all possible identifiers to maximize matching chances
            field_id = field.get('id', '')
            field_name = field.get('name', '')

            # Add by ID if present
            if field_id:
                field_map[field_id] = field
            # Add by name if present (and different from ID)
            if field_name and field_name != field_id:
                field_map[field_name] = field
            # Add by index as fallback
            field_map[str(fields.index(field))] = field

        print(f"Built field_map with {len(field_map)} entries for {len(fields)} fields")
        print(f"DEBUG: field_map keys: {list(field_map.keys())}")
        print(f"DEBUG: Sample fields - first 3 fields:")
        for i, field in enumerate(fields[:3]):
            print(f"  Field {i}: id='{field.get('id')}', name='{field.get('name')}', has {len(field.get('options', []))} options")
        # Debug: show which fields have options
        fields_with_options = [fid for fid, finfo in field_map.items() if finfo.get('options')]
        if fields_with_options:
            print(f"Fields with options: {fields_with_options[:5]}...")  # Show first 5

    resolved_values = {}

    for field_id, mapping_value in field_mapping.items():
        # Handle ACKNOWLEDGE_TRUE - set to "Yes" for checkboxes/agreements/dropdowns
        if mapping_starts_with(mapping_value, 'ACKNOWLEDGE_TRUE'):
            resolved_values[field_id] = 'Yes'
            print(f"Resolved {field_id}: {mapping_value} -> 'Yes'")
            continue

        # Skip special actions
        if mapping_value in SPECIAL_ACTIONS:
            continue
        # Also skip if mapping starts with special action keywords
        if any(mapping_starts_with(mapping_value, action) for action in SPECIAL_ACTIONS if action):
            continue

        # Skip if not a profile path (must contain a dot)
        if not isinstance(mapping_value, str) or '.' not in mapping_value:
            continue

        print(f"DEBUG: Resolving profile path for field '{field_id}': {mapping_value}")

        # Traverse the profile dictionary to get the value
        try:
            # Special handling for custom_answers (keys can have spaces/special chars)
            if mapping_value.startswith('custom_answers.'):
                custom_key = mapping_value[len('custom_answers.'):]  # Remove "custom_answers." prefix
                if 'custom_answers' in profile and custom_key in profile['custom_answers']:
                    current_value = profile['custom_answers'][custom_key]
                else:
                    raise KeyError(f"Custom answer key '{custom_key}' not found in profile")
            else:
                # Standard path traversal (e.g., "personal.first_name" -> ["personal", "first_name"])
                path_parts = mapping_value.split('.')

                # Navigate through the nested dictionary
                current_value = profile
                for part in path_parts:
                    if isinstance(current_value, dict) and part in current_value:
                        current_value = current_value[part]
                    else:
                        # Path not found in profile
                        raise KeyError(f"Path '{mapping_value}' not found in profile")

            # Only add if we got a value (allow False and 0, but skip None and empty strings)
            if current_value is not None and current_value != '':
                # Convert boolean values to match dropdown/radio options if available
                if isinstance(current_value, bool):
                    print(f"  DEBUG: Field '{field_id}' resolved to boolean: {current_value}")
                    print(f"  DEBUG: Looking for '{field_id}' in field_map (has {len(field_map)} entries)")
                    if field_id in field_map:
                        field_info = field_map[field_id]
                        field_options = field_info.get('options', [])
                        print(f"  DEBUG: Found field in field_map, has {len(field_options)} options")
                        if field_options:
                            print(f"  DEBUG: Options: {field_options}")
                            converted_value = convert_boolean_to_option(current_value, field_options)
                            print(f"  DEBUG: Converted {current_value} -> {converted_value}")
                            if converted_value != current_value:
                                print(f"Resolved {field_id}: {mapping_value} -> {current_value} -> converted to '{converted_value}' (matched dropdown options)")
                                resolved_values[field_id] = converted_value
                            else:
                                resolved_values[field_id] = current_value
                                print(f"Resolved {field_id}: {mapping_value} -> {current_value} (no conversion needed)")
                        else:
                            # No options available - use sensible default conversion
                            converted_value = 'Yes' if current_value else 'No'
                            resolved_values[field_id] = converted_value
                            print(f"Resolved {field_id}: {mapping_value} -> {current_value} -> '{converted_value}' (default boolean conversion, no options available)")
                    else:
                        # Field not in field_map - use sensible default conversion
                        converted_value = 'Yes' if current_value else 'No'
                        resolved_values[field_id] = converted_value
                        print(f"Resolved {field_id}: {mapping_value} -> {current_value} -> '{converted_value}' (default boolean conversion, field not in field_map)")
                        print(f"  DEBUG: Field '{field_id}' NOT FOUND in field_map. Available keys: {list(field_map.keys())[:10]}...")
                else:
                    resolved_values[field_id] = current_value
                    print(f"Resolved {field_id}: {mapping_value} -> {current_value}")
            else:
                print(f"Skipped {field_id}: {mapping_value} (empty value in profile)")

        except (KeyError, TypeError, AttributeError) as e:
            print(f"Warning: Could not resolve {field_id} -> {mapping_value}: {e}")
            # Skip this field if we can't resolve it
            continue

    print(f"Resolved {len(resolved_values)} field values from profile")
    return resolved_values


@app.route('/api/match-fields', methods=['OPTIONS'])
def match_fields_options():
    """Handle preflight OPTIONS request."""
    return '', 200


@app.route('/api/match-fields', methods=['POST'])
def match_fields():
    """
    Match form fields to user profile data using LLM and auto-fill where possible.

    Expects JSON:
    {
        "fields": [...],
        "actions": [...],
        "jobDetails": {
            "company_name": str,
            "role_title": str,
            "job_description": str
        }
    }

    Returns:
    {
        "status": "complete",
        "field_mappings": {...},      # Field ID to profile path or special value
        "fill_values": {...},         # Field ID to auto-filled value (profile + generated)
        "files": {...},               # File paths: {"resume": "...", "cover_letter": "..."}
        "needs_human": [...]          # Field IDs that need manual input
    }
    """
    print(f"Received {request.method} request to /api/match-fields")
    print(f"Request headers: {dict(request.headers)}")

    try:
        data = request.get_json()

        # Log incoming request
        logger.log("REQUEST", data)

        if not data:
            return jsonify({
                'error': 'No JSON data received',
                'status': 'error'
            }), 400

        # Extract fields, actions, and job details
        fields = data.get('fields', [])
        actions = data.get('actions', [])
        job_details = data.get('jobDetails', {})

        company_name = job_details.get('company_name', '')
        role_title = job_details.get('role_title', '')
        job_description = job_details.get('job_description', '')

        print(f"Received {len(fields)} fields and {len(actions)} actions")

        # DEBUG: Check which fields have options in the raw request
        fields_with_options = [f for f in fields if f.get('options')]
        fields_without_options = [f for f in fields if not f.get('options')]
        print(f"DEBUG: {len(fields_with_options)} fields have options, {len(fields_without_options)} don't")

        # DEBUG: Look for the specific problematic field
        problem_field = next((f for f in fields if f.get('id') == 'question_14070731008' or f.get('name') == 'question_14070731008'), None)
        if problem_field:
            print(f"DEBUG: Found problem field 'question_14070731008':")
            print(f"  id: {problem_field.get('id')}")
            print(f"  name: {problem_field.get('name')}")
            print(f"  type: {problem_field.get('type')}")
            print(f"  input_type: {problem_field.get('input_type')}")
            print(f"  label: {problem_field.get('label')}")
            print(f"  options: {problem_field.get('options')}")

        if fields_without_options:
            # Show first few fields without options
            for field in fields_without_options[:3]:
                print(f"  Field without options: id='{field.get('id')}', name='{field.get('name')}', input_type='{field.get('input_type')}', type='{field.get('type')}'")
        if company_name or role_title:
            print(f"Job details: {company_name} - {role_title}")

        # Load configuration and profile
        config = load_config()
        profile = load_profile()

        # Step 1: Map form fields (combines analysis + matching in one call)
        print("=" * 60)
        print("STEP 1: Mapping form fields")
        print("=" * 60)
        field_mapping = map_form_fields(fields, profile, config)

        # Step 2: Resolve profile paths to actual values
        print("=" * 60)
        print("STEP 2: Resolving profile values")
        print("=" * 60)
        field_values = resolve_profile_values(field_mapping, profile, fields)

        # Handle file lookups (resume uploads)
        files = {}
        resume_fields = [field_id for field_id, mapping in field_mapping.items()
                        if mapping_starts_with(mapping, 'RESUME_UPLOAD')]

        if resume_fields:
            resume_path = get_resume_path()
            if resume_path:
                # Found resume - map it to all RESUME_UPLOAD fields
                files['resume'] = resume_path
                print(f"Resume found for {len(resume_fields)} field(s): {resume_path}")
            else:
                print(f"No resume found for {len(resume_fields)} RESUME_UPLOAD field(s)")

        # Step 3: Generate cover letter if needed
        print("=" * 60)
        print("STEP 3: Cover letter generation")
        print("=" * 60)
        generated_content = {}
        cover_letter_text = ""
        why_paragraph = ""

        # Check if any fields need cover letter content
        cover_letter_fields = [
            field_id for field_id, mapping in field_mapping.items()
            if mapping_starts_with(mapping, 'COVER_LETTER_FULL') or
               mapping_starts_with(mapping, 'COVER_LETTER_BODY') or
               mapping_starts_with(mapping, 'COVER_LETTER_WHY')
        ]

        # Generate cover letter if needed
        if cover_letter_fields:
            # Check if we have required job details
            if company_name and role_title:
                try:
                    print(f"Generating cover letter for {company_name} - {role_title}...")
                    result = run_pipeline(
                        company_name=company_name,
                        role_title=role_title,
                        job_description=job_description,
                        dry_run=False
                    )

                    # Store the generated content
                    cover_letter_text = result['body_text']
                    why_paragraph = result['paragraph']  # The why-company paragraph
                    docx_path = result['docx_path']

                    # Add cover letter file path (for file uploads)
                    files['cover_letter'] = docx_path

                    print(f"Cover letter generated: {docx_path}")
                    print(f"Body text: {len(cover_letter_text)} characters")
                    print(f"Why paragraph: {len(why_paragraph)} characters")

                except Exception as e:
                    print(f"Error generating cover letter: {e}")
                    import traceback
                    traceback.print_exc()
                    # If generation fails, these fields will go to needs_human
            else:
                print(f"Cover letter fields found but missing job details (company: {bool(company_name)}, role: {bool(role_title)})")

        # Step 4: Generate content for fields that need it
        print("=" * 60)
        print("STEP 4: Generating application content")
        print("=" * 60)

        # Collect fields that need content generation
        content_fields = [
            field_id for field_id, mapping in field_mapping.items()
            if mapping_starts_with(mapping, 'COVER_LETTER_FULL') or
               mapping_starts_with(mapping, 'COVER_LETTER_BODY') or
               mapping_starts_with(mapping, 'COVER_LETTER_WHY') or
               mapping_starts_with(mapping, 'GENERATE_ANSWER')
        ]

        # Build a map of field_id to field info for quick lookup
        field_map = {f.get('id', str(i)): f for i, f in enumerate(fields)}

        # Collect field information for content generation
        fields_to_process = []
        for field_id in content_fields:
            field_info = field_map.get(field_id, {})
            action = field_mapping.get(field_id, '')
            fields_to_process.append({
                "field_id": field_id,
                "action": action,
                "label": field_info.get('label', ''),
                "placeholder": field_info.get('placeholder', ''),
                "hint": field_info.get('hint', ''),
                "type": field_info.get('type', ''),
            })

        # Batch generate content if we have fields to process
        if fields_to_process and (cover_letter_text or why_paragraph):
            try:
                print(f"Generating content for {len(fields_to_process)} field(s)...")
                batch_answers = generate_application_content(
                    cover_letter_text=cover_letter_text,
                    why_paragraph=why_paragraph,
                    fields_to_process=fields_to_process,
                    field_mapping=field_mapping,
                    profile=profile,
                    config=config
                )

                # Add answers to generated_content
                for field_id, answer in batch_answers.items():
                    # Check if answer is NEEDS_HUMAN
                    if answer and not answer.startswith("NEEDS_HUMAN"):
                        generated_content[field_id] = answer
                        print(f"Added content for {field_id}: {answer[:50]}...")
                    else:
                        print(f"Field {field_id} needs human input")

            except Exception as e:
                print(f"Error in content generation: {e}")
                import traceback
                traceback.print_exc()
                # If batch processing fails, fields will go to needs_human

        # Step 5: Identify fields that need human attention
        print("=" * 60)
        print("STEP 5: Identifying fields needing human attention")
        print("=" * 60)

        # These are fields that:
        # 1. NEEDS_HUMAN, SKIP - always need human
        # 2. RESUME_UPLOAD fields where no resume was found
        # 3. Content generation fields where generation failed
        # 4. Profile paths that couldn't be resolved
        # 5. ACKNOWLEDGE_TRUE fields are auto-filled, don't need human
        ALWAYS_HUMAN_ACTIONS = {
            'NEEDS_HUMAN', 'SKIP', None
        }

        AUTO_FILLED_ACTIONS = {
            'RESUME_UPLOAD', 'COVER_LETTER_FULL', 'COVER_LETTER_BODY',
            'COVER_LETTER_WHY', 'GENERATE_ANSWER', 'ACKNOWLEDGE_TRUE'
        }

        needs_human = []
        for field_id, mapping_value in field_mapping.items():
            # Special actions that always need human attention
            if mapping_value in ALWAYS_HUMAN_ACTIONS:
                needs_human.append(field_id)
                print(f"  {field_id}: {mapping_value} - always needs human")
            # Also check if mapping starts with NEEDS_HUMAN or SKIP
            elif mapping_starts_with(mapping_value, 'NEEDS_HUMAN') or mapping_starts_with(mapping_value, 'SKIP'):
                needs_human.append(field_id)
                print(f"  {field_id}: {mapping_value} - needs human")
            # RESUME_UPLOAD fields need human attention only if no resume was found
            elif mapping_starts_with(mapping_value, 'RESUME_UPLOAD') and 'resume' not in files:
                needs_human.append(field_id)
                print(f"  {field_id}: RESUME_UPLOAD but no resume found")
            # Content generation fields need human attention if generation failed
            elif (mapping_starts_with(mapping_value, 'COVER_LETTER_FULL') or
                  mapping_starts_with(mapping_value, 'COVER_LETTER_BODY') or
                  mapping_starts_with(mapping_value, 'COVER_LETTER_WHY') or
                  mapping_starts_with(mapping_value, 'GENERATE_ANSWER')) and field_id not in generated_content:
                needs_human.append(field_id)
                print(f"  {field_id}: {mapping_value} but generation failed")
            # ACKNOWLEDGE_TRUE fields are auto-filled, don't need human
            elif mapping_starts_with(mapping_value, 'ACKNOWLEDGE_TRUE'):
                continue
            # Profile paths that couldn't be resolved also need attention
            elif field_id not in field_values and mapping_value not in AUTO_FILLED_ACTIONS and mapping_value not in ALWAYS_HUMAN_ACTIONS:
                # Also check if it starts with any auto-filled action keyword
                if not any(mapping_starts_with(mapping_value, action) for action in AUTO_FILLED_ACTIONS if action):
                    needs_human.append(field_id)
                    print(f"  {field_id}: Couldn't resolve value")

        # Combine profile_values and generated_content into fill_values
        fill_values = {}
        fill_values.update(field_values)  # Profile data
        fill_values.update(generated_content)  # Generated answers (cover letter, freeform, specific)

        print(f"Processing complete: {len(fill_values)} auto-filled, {len(needs_human)} need human, {len(files)} files")

        # Print token usage summary
        tracker.print_summary()
        total = tracker.get_session_total()
        print(f"Session total: {total['total_tokens']:,} tokens, ${total['total_cost']:.4f}")

        # Build response data
        response_data = {
            'status': 'complete',
            'field_mappings': field_mapping,
            'fill_values': fill_values,
            'files': files,
            'needs_human': needs_human
        }

        # Log outgoing response
        logger.log("RESPONSE", response_data)

        return jsonify(response_data), 200

    except FileNotFoundError as e:
        print(f"File not found: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500
    except Exception as e:
        print(f"Error processing request: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'job-application-tool'
    }), 200


@app.route('/api/token-usage', methods=['GET'])
def token_usage():
    """Get token usage summary for current session."""
    summary = tracker.get_summary()
    session_total = tracker.get_session_total()

    return jsonify({
        'session_total': session_total,
        'by_task': list(summary.values())
    }), 200


@app.route('/api/test', methods=['GET', 'POST', 'OPTIONS'])
def test():
    """Simple test endpoint to verify CORS is working."""
    print(f"Test endpoint hit with {request.method}")
    return jsonify({
        'status': 'ok',
        'method': request.method,
        'message': 'CORS is working'
    }), 200


def shutdown_handler():
    """Export token usage log on server shutdown."""
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = f"logs/server_token_usage_{timestamp}.log"
    tracker.export_log(log_path)
    print(f"\nServer shutting down. Token usage log saved to {log_path}")
    tracker.print_summary()


if __name__ == '__main__':
    import atexit
    atexit.register(shutdown_handler)

    print("Starting Flask server on http://localhost:5050")
    print("CORS enabled for browser extension access")
    print("Listening on all interfaces (0.0.0.0:5050)")
    app.run(host='0.0.0.0', port=5050, debug=True)
