# Job Application Form Scanner - Chrome Extension

A Chrome extension that scans, analyzes, and automatically fills job application forms using AI-powered field matching.

## Features

### Form Scanning
- **Field Detection**: Scans all visible form fields (input, select, textarea)
- **Metadata Extraction**:
  - Label text (from label, aria-label, or placeholder)
  - Field type (text, email, select, file, etc.)
  - Name and ID attributes
  - Required status and current value
  - Placeholder and autocomplete attributes
- **Dropdown Options**: Captures options for select, radio, and checkbox groups
- **Custom Dropdown Support**: Detects non-standard dropdowns (Greenhouse, Lever ATS systems)
- **Smart Inference**: Infers Yes/No options for boolean questions when options aren't available

### Job Details Extraction
- **Universal Company Detection**:
  - URL patterns (Greenhouse, Lever)
  - JSON-LD structured data
  - Meta tags (og:site_name, author, company)
  - Page title parsing
  - DOM selectors and data attributes
- **Role Title Extraction**: From og:title, h1, and page structure
- **Job Description**: Captures full posting text

### Form Filling
- **Automatic Field Population**: Fills text, select, checkbox, and radio fields
- **File Uploads**: Automatically attaches resume and cover letter files
- **Fuzzy Matching**: Handles variations in dropdown options:
  - Boolean: Yes/No, true/false, Y/N, 1/0
  - Countries: "United States" ↔ "US" ↔ "USA"
- **Smart Type Detection**: Adapts fill strategy based on field type

### Backend Integration
- Communicates with Flask server at `http://localhost:5050`
- Sends scanned form data for AI analysis
- Receives matched values and auto-fill instructions
- Downloads files from server for upload

## Quick Start

### Prerequisites
1. Python 3.x with required packages (`pip install -r requirements.txt`)
2. Anthropic API key set in environment or `.env` file
3. User profile configured in `user-data/profile.json`
4. Resume file in `user-data/resume/` directory

### Installation

1. **Install Extension:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `browser-extension/` directory
   - The extension icon will appear in your toolbar

2. **Start Backend Server:**
   ```bash
   python server.py
   ```

3. **Ready to Apply!**
   - Navigate to any job application page
   - Click extension icon → Scan → Send → Fill

**Note:** The extension references icon files (icon16.png, icon48.png, icon128.png) in manifest.json. These are optional - Chrome will use a default icon if they're not present. To add custom icons, create PNG files with those names in the `browser-extension/` directory.

## Usage

### Complete Workflow

1. **Start the backend server:**
   ```bash
   python server.py
   ```

2. **Fill out a job application:**
   - Navigate to a job application page
   - Click the extension icon in your toolbar
   - Click **"Scan Form Fields"** - Extension scans the page
   - (Optional) Enter company name and role title if not auto-detected
   - Click **"Send to Backend"** - Server analyzes fields and generates content
   - Review the results in the popup (shows field count, files, and manual fields)
   - Click **"Fill Form"** - Extension fills all fields and uploads files
   - Review and submit the form

### What Gets Auto-Filled

**From Profile:**
- Personal info (name, email, phone, address)
- Work authorization status
- Preferences (relocation, hybrid work, start date)
- Demographics (optional, configurable)
- Custom answers for company-specific questions

**Generated Content:**
- Cover letter (full, body-only, or just "why" paragraph)
- Answers to open-ended questions
- Company-specific motivation statements

**File Uploads:**
- Resume (PDF/DOCX from `user-data/resume/`)
- Cover letter (auto-generated DOCX)

**Manual Review:**
- Fields marked as `NEEDS_HUMAN`
- Company-specific questions without custom answers
- Complex multi-part questions

### Custom Answers for Company-Specific Questions

Add answers to frequently asked company-specific questions in your `user-data/profile.json`:

```json
{
  "custom_answers": {
    "Have you ever interviewed at Anthropic before": "No",
    "Have you interviewed here before": "No",
    "Have you worked at Google": "Yes",
    "Why do you want to work in San Francisco": "I currently live in San Francisco"
  }
}
```

**Features:**
- Fuzzy matching (question doesn't need exact wording)
- No code changes needed - just edit the JSON
- Works across all companies and forms
- Automatically selected when questions match

### Troubleshooting

**"Backend server not running"**
- Start the server: `python server.py`
- Check it's running on port 5050

**"No fields filled"**
- Check browser console for errors
- Verify field IDs match between scan and fill
- Some sites use dynamic IDs that change on reload

**"File upload failed"**
- Ensure files exist in `user-data/resume/`
- Check file permissions
- Some sites may require manual file selection

**"Fields marked as NEEDS_HUMAN"**
- Add entry to `custom_answers` in profile.json
- Or manually fill these fields after auto-fill

## Development

### Files

- `manifest.json` - Extension configuration (Manifest V3)
- `popup.html` - Extension popup UI
- `popup.js` - Popup logic and content script injection
- `content.js` - Page scraping logic that extracts form field data

### How it works

1. User clicks "Scan Form Fields" button
2. `popup.js` injects `content.js` into the active tab
3. `content.js` scans the page for form fields and action elements
4. Results are returned as an object with `fields` and `actions` arrays
5. `popup.js` displays the results as formatted JSON

### Data Structure

The extension sends a comprehensive data object to the backend:

```json
{
  "fields": [
    {
      "label": "Email Address",
      "type": "email",
      "name": "email",
      "id": "email-input",
      "input_type": "text",
      "required": true,
      "value": "",
      "placeholder": "you@example.com",
      "autocomplete": "email",
      "hint": ""
    },
    {
      "label": "Are you open to relocation?",
      "type": "select",
      "name": "relocation",
      "id": "relocation_field",
      "input_type": "select",
      "required": true,
      "value": "",
      "options": [
        {"value": "Yes", "text": "Yes"},
        {"value": "No", "text": "No"}
      ]
    },
    {
      "label": "Resume",
      "type": "file",
      "name": "resume",
      "id": "resume_upload",
      "input_type": "file",
      "required": true
    }
  ],
  "actions": [...],
  "jobDetails": {
    "company_name": "Anthropic",
    "role_title": "Product Manager, Claude Code Growth",
    "job_description": "Full job posting text..."
  }
}
```

**Field Properties:**
- `options`: Array of {value, text} objects for dropdowns/radios (captured or inferred)
- `input_type`: Refined type (e.g., `custom_select` for non-standard dropdowns)
- `hint`: Additional context text from nearby elements

### Permissions

- `activeTab` - Access to the currently active tab
- `scripting` - Ability to inject content scripts

## Completed Features

- ✅ Server communication for form data processing
- ✅ LLM-powered field matching logic
- ✅ Automatic form filling with fuzzy matching
- ✅ File upload automation (resume, cover letter)
- ✅ Custom dropdown detection (Greenhouse, Lever)
- ✅ Universal company name extraction
- ✅ Boolean-to-dropdown conversion
- ✅ Custom answers for company-specific questions

## Future Enhancements

- Add field mapping/configuration UI
- Store form templates for reuse
- Add support for multi-page forms
- Improve error handling and retry logic
- Add option to preview before filling
- Support for more ATS platforms (Workday, Taleo, etc.)
- Batch application support
