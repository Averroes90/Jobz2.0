# ACKNOWLEDGE_TRUE Field Mapping

## Overview

The `ACKNOWLEDGE_TRUE` mapping is used for form fields that require the user to acknowledge, agree to, or certify something (typically checkboxes or radio buttons for terms of service, privacy policies, data accuracy certifications, etc.).

## Behavior

When a field is mapped to `ACKNOWLEDGE_TRUE`:
1. The field is automatically set to `true` (boolean) in `fill_values`
2. The field is NOT added to `needs_human` (it's auto-filled)
3. The extension can use this value to check the checkbox or select "Yes"

## Example

### Input Fields (from browser extension):
```json
{
  "fields": [
    {
      "id": "agree_terms",
      "label": "I agree to the Terms of Service",
      "type": "checkbox",
      "required": true
    },
    {
      "id": "certify_info",
      "label": "I certify that the information provided is accurate",
      "type": "checkbox",
      "required": true
    },
    {
      "id": "first_name",
      "label": "First Name",
      "type": "text"
    }
  ]
}
```

### LLM Field Matching (automatic):
```json
{
  "agree_terms": "ACKNOWLEDGE_TRUE",
  "certify_info": "ACKNOWLEDGE_TRUE",
  "first_name": "personal.first_name"
}
```

### Backend Response:
```json
{
  "status": "complete",
  "field_mappings": {
    "agree_terms": "ACKNOWLEDGE_TRUE",
    "certify_info": "ACKNOWLEDGE_TRUE",
    "first_name": "personal.first_name"
  },
  "fill_values": {
    "agree_terms": true,
    "certify_info": true,
    "first_name": "John"
  },
  "files": {},
  "needs_human": []
}
```

## Common Use Cases

Fields that should map to `ACKNOWLEDGE_TRUE`:
- "I agree to the Terms of Service"
- "I certify that the information is accurate"
- "I acknowledge that I have read the privacy policy"
- "I consent to background checks"
- "I confirm my eligibility to work"
- "I authorize the company to contact my references"

## Extension Handling

The browser extension receives `true` and can:
- For checkboxes: `element.checked = true`
- For radio buttons: `element.checked = true`
- For text fields (rare): Set value to "Yes" or "Agree"

Example:
```javascript
// In extension's fill form logic
if (fieldType === 'checkbox' || fieldType === 'radio') {
  element.checked = fillValue === true;
} else if (typeof fillValue === 'boolean') {
  element.value = fillValue ? 'Yes' : 'No';
}
```

## Prompt Instructions

From `prompts/field_matching_prompt.md`:
```
- "ACKNOWLEDGE_TRUE" - for checkboxes or fields asking to acknowledge,
  agree, confirm, accept policy, certify, or consent (should be marked
  as true/checked)
```

The LLM automatically identifies these fields based on keywords in the label like:
- "acknowledge"
- "agree"
- "confirm"
- "accept"
- "certify"
- "consent"
