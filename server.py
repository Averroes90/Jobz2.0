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
from generate_cover_letter import run_pipeline

# Load environment variables
load_dotenv()

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

    # Extract text from response
    full_text = ""
    for block in response.content:
        if isinstance(block, TextBlock):
            full_text += block.text

    answer = full_text.strip()

    # Check if LLM returned NEEDS_HUMAN
    if answer == "NEEDS_HUMAN":
        print(f"Question needs human: {question[:50]}")
        return None

    print(f"Generated answer: {answer[:100]}...")
    return answer


def match_fields_with_llm(form_fields: list, profile: dict, config: dict) -> dict:
    """
    Use LLM to match form fields to user profile data.

    Args:
        form_fields: List of form field objects from the extension
        profile: User profile data dictionary
        config: Application configuration

    Returns:
        Dictionary mapping field identifiers to profile paths or special values
    """
    client = anthropic.Anthropic()

    # Get the model for field matching
    model_name = config["task_models"]["field_matching"]
    model_id = config["model_definitions"][model_name]["model_id"]

    # Load and format the field matching prompt
    prompt_template = load_prompt("field_matching_prompt.md")
    prompt = prompt_template.format(
        profile=json.dumps(profile, indent=2),
        form_fields=json.dumps(form_fields, indent=2)
    )

    print(f"Calling LLM for field matching with model: {model_id}")

    # Call the Anthropic API
    response = client.messages.create(
        model=model_id,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}]
    )

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
        print(f"LLM returned mapping with {len(mapping)} entries")
        return mapping
    except json.JSONDecodeError as e:
        print(f"Error parsing LLM response as JSON: {e}")
        print(f"Response text: {full_text}")
        # Return empty mapping on parse error
        return {}


def resolve_profile_values(field_mapping: dict, profile: dict) -> dict:
    """
    Resolve profile paths to actual values.

    Args:
        field_mapping: Dictionary mapping field IDs to profile paths or special values
                      (e.g., {"first_name": "personal.first_name", "resume": "RESUME_UPLOAD"})
        profile: User profile data dictionary

    Returns:
        Dictionary mapping field IDs to actual values from profile
        (e.g., {"first_name": "John", "email": "john@example.com"})
    """
    # Special action values that should not be resolved
    SPECIAL_ACTIONS = {
        'RESUME_UPLOAD',
        'COVER_LETTER',
        'FREEFORM_ANSWER',
        'SPECIFIC_QUESTION',
        'SKIP',
        'UNKNOWN',
        None
    }

    resolved_values = {}

    for field_id, mapping_value in field_mapping.items():
        # Skip special actions
        if mapping_value in SPECIAL_ACTIONS:
            continue

        # Skip if not a profile path (must contain a dot)
        if not isinstance(mapping_value, str) or '.' not in mapping_value:
            continue

        # Traverse the profile dictionary to get the value
        try:
            # Split the path (e.g., "personal.first_name" -> ["personal", "first_name"])
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
        if company_name or role_title:
            print(f"Job details: {company_name} - {role_title}")

        # Load configuration and profile
        config = load_config()
        profile = load_profile()

        # Use LLM to match fields to profile
        field_mapping = match_fields_with_llm(fields, profile, config)

        # Resolve profile paths to actual values
        field_values = resolve_profile_values(field_mapping, profile)

        # Handle file lookups (resume uploads)
        files = {}
        resume_fields = [field_id for field_id, mapping in field_mapping.items()
                        if mapping == 'RESUME_UPLOAD']

        if resume_fields:
            resume_path = get_resume_path()
            if resume_path:
                # Found resume - map it to all RESUME_UPLOAD fields
                files['resume'] = resume_path
                print(f"Resume found for {len(resume_fields)} field(s): {resume_path}")
            else:
                print(f"No resume found for {len(resume_fields)} RESUME_UPLOAD field(s)")

        # Handle cover letter generation
        generated_content = {}
        cover_letter_fields = [field_id for field_id, mapping in field_mapping.items()
                              if mapping == 'COVER_LETTER']

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

                    # Store the generated paragraph and file path
                    paragraph = result['paragraph']
                    docx_path = result['docx_path']

                    # Add paragraph to generated_content for all COVER_LETTER fields
                    for field_id in cover_letter_fields:
                        generated_content[field_id] = paragraph

                    # Add cover letter file path
                    files['cover_letter'] = docx_path

                    print(f"Cover letter generated: {docx_path}")
                    print(f"Paragraph added to {len(cover_letter_fields)} field(s)")

                except Exception as e:
                    print(f"Error generating cover letter: {e}")
                    import traceback
                    traceback.print_exc()
                    # If generation fails, these fields will go to needs_human
            else:
                print(f"Cover letter fields found but missing job details (company: {bool(company_name)}, role: {bool(role_title)})")

        # Handle freeform answer fields
        freeform_fields = [(field_id, mapping) for field_id, mapping in field_mapping.items()
                          if mapping == 'FREEFORM_ANSWER']

        if freeform_fields:
            print(f"Found {len(freeform_fields)} freeform answer field(s)")

            # Build a map of field_id to field info for quick lookup
            field_map = {f.get('id', str(i)): f for i, f in enumerate(fields)}

            for field_id, _ in freeform_fields:
                # Get the field info to extract the label (question)
                field_info = field_map.get(field_id, {})
                question = field_info.get('label', '')

                if not question or question == '[No label]':
                    print(f"Skipping field {field_id} - no label/question found")
                    continue

                try:
                    # Generate answer
                    # TODO: Could pass company_context if we did research for cover letter
                    answer = generate_freeform_answer(
                        question=question,
                        company_context="",
                        config=config
                    )

                    # Store the answer
                    generated_content[field_id] = answer
                    print(f"Generated answer for field {field_id}")

                except Exception as e:
                    print(f"Error generating freeform answer for field {field_id}: {e}")
                    import traceback
                    traceback.print_exc()
                    # If generation fails, field will go to needs_human

        # Handle specific question fields
        specific_question_fields = [(field_id, mapping) for field_id, mapping in field_mapping.items()
                                   if mapping == 'SPECIFIC_QUESTION']

        if specific_question_fields:
            print(f"Found {len(specific_question_fields)} specific question field(s)")

            # Build a map of field_id to field info for quick lookup
            field_map = {f.get('id', str(i)): f for i, f in enumerate(fields)}

            for field_id, _ in specific_question_fields:
                # Get the field info to extract the label (question)
                field_info = field_map.get(field_id, {})
                question = field_info.get('label', '')

                if not question or question == '[No label]':
                    print(f"Skipping field {field_id} - no label/question found")
                    continue

                try:
                    # Try to answer from profile
                    answer = answer_specific_question(
                        question=question,
                        profile=profile,
                        config=config
                    )

                    # If answer returned (not None), store it
                    if answer is not None:
                        generated_content[field_id] = answer
                        print(f"Answered specific question for field {field_id}")
                    else:
                        # LLM returned NEEDS_HUMAN, field will go to needs_human
                        print(f"Specific question field {field_id} needs human input")

                except Exception as e:
                    print(f"Error answering specific question for field {field_id}: {e}")
                    import traceback
                    traceback.print_exc()
                    # If error occurs, field will go to needs_human

        # Identify fields that need human attention
        # These are fields that:
        # 1. SKIP, UNKNOWN - always need human
        # 2. RESUME_UPLOAD fields where no resume was found
        # 3. COVER_LETTER fields where generation failed or job details missing
        # 4. FREEFORM_ANSWER fields where generation failed (no label or error)
        # 5. SPECIFIC_QUESTION fields where LLM returned NEEDS_HUMAN or error
        # 6. Profile paths that couldn't be resolved
        ALWAYS_HUMAN_ACTIONS = {
            'SKIP', 'UNKNOWN', None
        }

        needs_human = []
        for field_id, mapping_value in field_mapping.items():
            # Special actions that always need human attention
            if mapping_value in ALWAYS_HUMAN_ACTIONS:
                needs_human.append(field_id)
            # RESUME_UPLOAD fields need human attention only if no resume was found
            elif mapping_value == 'RESUME_UPLOAD' and 'resume' not in files:
                needs_human.append(field_id)
            # COVER_LETTER fields need human attention if generation failed or wasn't attempted
            elif mapping_value == 'COVER_LETTER' and field_id not in generated_content:
                needs_human.append(field_id)
            # FREEFORM_ANSWER fields need human attention if generation failed
            elif mapping_value == 'FREEFORM_ANSWER' and field_id not in generated_content:
                needs_human.append(field_id)
            # SPECIFIC_QUESTION fields need human attention if answer not generated
            elif mapping_value == 'SPECIFIC_QUESTION' and field_id not in generated_content:
                needs_human.append(field_id)
            # Profile paths that couldn't be resolved also need attention
            elif field_id not in field_values and mapping_value not in ['RESUME_UPLOAD', 'COVER_LETTER', 'FREEFORM_ANSWER', 'SPECIFIC_QUESTION'] + list(ALWAYS_HUMAN_ACTIONS):
                needs_human.append(field_id)

        # Combine profile_values and generated_content into fill_values
        fill_values = {}
        fill_values.update(field_values)  # Profile data
        fill_values.update(generated_content)  # Generated answers (cover letter, freeform, specific)

        print(f"Processing complete: {len(fill_values)} auto-filled, {len(needs_human)} need human, {len(files)} files")

        return jsonify({
            'status': 'complete',
            'field_mappings': field_mapping,
            'fill_values': fill_values,
            'files': files,
            'needs_human': needs_human
        }), 200

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


@app.route('/api/test', methods=['GET', 'POST', 'OPTIONS'])
def test():
    """Simple test endpoint to verify CORS is working."""
    print(f"Test endpoint hit with {request.method}")
    return jsonify({
        'status': 'ok',
        'method': request.method,
        'message': 'CORS is working'
    }), 200


if __name__ == '__main__':
    print("Starting Flask server on http://localhost:5050")
    print("CORS enabled for browser extension access")
    print("Listening on all interfaces (0.0.0.0:5050)")
    app.run(host='0.0.0.0', port=5050, debug=True)
