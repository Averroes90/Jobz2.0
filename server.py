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

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Enable CORS for browser extension access
CORS(app)

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

    # Parse JSON response
    try:
        mapping = json.loads(full_text.strip())
        print(f"LLM returned mapping with {len(mapping)} entries")
        return mapping
    except json.JSONDecodeError as e:
        print(f"Error parsing LLM response as JSON: {e}")
        print(f"Response text: {full_text}")
        # Return empty mapping on parse error
        return {}


@app.route('/api/match-fields', methods=['POST'])
def match_fields():
    """
    Match form fields to user profile data using LLM.

    Expects JSON:
    {
        "fields": [...],
        "actions": [...]
    }

    Returns:
    {
        "fields": [...],
        "actions": [...],
        "field_mapping": {...},  # Field ID/index to profile path mapping
        "status": "success"
    }
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                'error': 'No JSON data received',
                'status': 'error'
            }), 400

        # Extract fields and actions
        fields = data.get('fields', [])
        actions = data.get('actions', [])

        print(f"Received {len(fields)} fields and {len(actions)} actions")

        # Load configuration and profile
        config = load_config()
        profile = load_profile()

        # Use LLM to match fields to profile
        field_mapping = match_fields_with_llm(fields, profile, config)

        return jsonify({
            'fields': fields,
            'actions': actions,
            'field_mapping': field_mapping,
            'status': 'success',
            'message': f'Matched {len(fields)} fields using LLM'
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


if __name__ == '__main__':
    print("Starting Flask server on http://localhost:5000")
    print("CORS enabled for browser extension access")
    app.run(host='localhost', port=5000, debug=True)
