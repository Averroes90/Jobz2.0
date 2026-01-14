# Job Application Form Scanner - Chrome Extension

A Chrome extension that scans and extracts form field information from job application pages.

## Features

### Form Fields
- Scans all visible form fields (input, select, textarea)
- Extracts field metadata:
  - Label text (from label, aria-label, or placeholder)
  - Field type (text, email, select, etc.)
  - Name and ID attributes
  - Required status
  - Current value
  - Placeholder text
  - Autocomplete attribute

### Actions
- Scans interactive elements:
  - `<button>` elements
  - `<input type="submit">` and `<input type="button">`
  - Elements with `role="button"` attribute
  - Links (`<a>`) containing keywords: "apply", "upload", "submit", "linkedin"
- Extracts action metadata:
  - Type (button, input-button, role-button, link)
  - Text content
  - ID and class attributes
  - Button type attribute
  - href (for links)

### Backend Communication
- Send scanned data to Flask backend server
- POST to `http://localhost:5050/api/match-fields`
- Receive matched/filled field values from server
- Display backend response in popup

### Output
- Simple popup UI with JSON output
- Separate arrays for fields and actions
- Optional backend integration for field matching

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `browser-extension/` directory
5. The extension icon will appear in your toolbar

**Note:** The extension references icon files (icon16.png, icon48.png, icon128.png) in manifest.json. These are optional - Chrome will use a default icon if they're not present. To add custom icons, create PNG files with those names in the `browser-extension/` directory.

## Usage

### Basic Usage (Local Only)

1. Navigate to any web page with a form (e.g., a job application page)
2. Click the extension icon in your toolbar
3. Click the "Scan Form Fields" button in the popup
4. View the extracted form field data in JSON format

### With Backend Server

1. **Start the backend server:**
   ```bash
   python server.py
   ```

2. **Scan and send:**
   - Navigate to a job application page
   - Click the extension icon
   - Click "Scan Form Fields"
   - Click "Send to Backend" to send data to server
   - View the server response in the popup

**Note:** If the server is not running, you'll see an error message: "Backend server not running. Start server with: python server.py"

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

The extension returns an object with two arrays:

```json
{
  "fields": [
    {
      "label": "Email Address",
      "type": "email",
      "name": "email",
      "id": "email-input",
      "required": true,
      "value": "",
      "placeholder": "you@example.com",
      "autocomplete": "email"
    }
  ],
  "actions": [
    {
      "type": "button",
      "text": "Submit Application",
      "buttonType": "submit",
      "id": "submit-btn",
      "class": "btn btn-primary",
      "href": ""
    },
    {
      "type": "link",
      "text": "Upload Resume",
      "buttonType": "",
      "id": "",
      "class": "upload-link",
      "href": "https://example.com/upload"
    }
  ]
}
```

### Permissions

- `activeTab` - Access to the currently active tab
- `scripting` - Ability to inject content scripts

## Next Steps

- ✅ ~~Add server communication to send form data to backend~~
- Implement field matching logic in backend server
- Implement form auto-fill functionality
- Add field mapping/configuration UI
- Store form templates for reuse
- Add support for multi-page forms
