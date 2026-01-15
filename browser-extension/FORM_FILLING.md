# Form Filling Documentation

## Overview

The browser extension can automatically fill form fields with data from the backend, including special handling for checkboxes that need to be checked (e.g., "I agree to Terms of Service").

## How It Works

### 1. Field Matching Flow

1. User scans the form → Extension extracts all fields
2. User sends to backend → Backend matches fields to profile/special actions
3. Backend returns `fill_values` with field IDs mapped to values
4. User clicks "Fill Form" → Extension fills the fields

### 2. Checkbox Handling

When a checkbox field is mapped to `ACKNOWLEDGE_TRUE`:

**Backend (server.py):**
```python
# In resolve_profile_values()
if mapping_value == 'ACKNOWLEDGE_TRUE':
    resolved_values[field_id] = True  # Boolean true
```

**Extension (popup.js):**
```javascript
// Injected fill function
if (fieldType === 'checkbox') {
  if (value === true || value === 'true' || value === 1) {
    element.checked = true;

    // Dispatch both click and change events
    element.dispatchEvent(new Event('click', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
```

### Why Both Events?

Many web forms use event listeners to:
- **`click` event**: Trigger visual feedback, animations, or validation
- **`change` event**: Update form state, enable/disable buttons, validate requirements

Dispatching both ensures maximum compatibility with different form implementations.

## Supported Field Types

### Checkboxes
```javascript
// Backend returns: { "agree_terms": true }
// Extension sets: element.checked = true
// Events: click, change
```

### Radio Buttons
```javascript
// Backend returns: { "gender_male": true }
// Extension sets: element.checked = true
// Events: click, change
```

### Text Inputs
```javascript
// Backend returns: { "first_name": "John" }
// Extension sets: element.value = "John"
// Events: input, change
```

### Select Dropdowns
```javascript
// Backend returns: { "country": "United States" }
// Extension finds option by value or text, sets element.value
// Events: change
```

### Textareas
```javascript
// Backend returns: { "bio": "I am a software engineer..." }
// Extension sets: element.value = "I am a software engineer..."
// Events: input, change
```

## Field Identification

The extension tries multiple methods to find fields:

1. **By ID**: `document.getElementById(fieldId)`
2. **By name attribute**: `document.querySelector('[name="fieldName"]')`
3. **By array index**: For fields without ID/name, uses index from scan

Example:
```javascript
// Field scanned as: { id: "agree_terms", label: "I agree..." }
// Backend returns: { "agree_terms": true }
// Extension finds: document.getElementById("agree_terms")
```

## Fill Results

After filling, the extension reports:

```javascript
{
  filled: [
    { field: "first_name", type: "text", value: "John" },
    { field: "agree_terms", type: "checkbox", value: true }
  ],
  notFound: ["middle_name"],  // Fields that couldn't be located
  errors: [
    { field: "country", error: "Option not found" }  // Failed fills
  ]
}
```

## Testing

### Test Form

A test form is provided in `test_form.html` with:
- Text inputs (first name, email, phone)
- Checkboxes for agreements
- Console logging to verify events are fired

### How to Test

1. Open `test_form.html` in Chrome
2. Load the extension
3. Click "Scan Form Fields"
4. Click "Send to Backend"
5. Click "Fill Form"
6. Open DevTools Console (F12) to see:
   - Which fields were filled
   - Click and change events being fired
   - Final form state

### Expected Backend Response

```json
{
  "fill_values": {
    "first_name": "John",
    "email": "john@example.com",
    "phone": "415-806-5906",
    "requires_sponsorship": false,
    "agree_terms": true,
    "certify_info": true,
    "acknowledge_privacy": true,
    "consent_background": true
  }
}
```

## Common Issues

### Checkboxes not checking
- **Problem**: Form uses custom checkbox implementation
- **Solution**: The fill function dispatches both `click` and `change` events which should trigger most implementations

### Fields not found
- **Problem**: Field ID changed after scan, or dynamic form
- **Solution**: Re-scan the form before filling

### Events not firing
- **Problem**: Form expects user-triggered events
- **Solution**: Events are dispatched with `bubbles: true` to propagate up the DOM

### Values not persisting
- **Problem**: Form uses a framework (React, Vue) that manages its own state
- **Solution**: Dispatching `input` and `change` events usually updates framework state

## Future Enhancements

- [ ] Support for file uploads (RESUME_UPLOAD)
- [ ] Support for multi-select dropdowns
- [ ] Support for date pickers
- [ ] Retry mechanism for fields that fail to fill
- [ ] Visual feedback showing which fields were filled
