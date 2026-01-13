# Job Application Form Scanner - Chrome Extension

A Chrome extension that scans and extracts form field information from job application pages.

## Features

- Scans all visible form fields (input, select, textarea)
- Extracts field metadata:
  - Label text (from label, aria-label, or placeholder)
  - Field type (text, email, select, etc.)
  - Name and ID attributes
  - Required status
  - Current value
  - Placeholder text
  - Autocomplete attribute
- Simple popup UI with JSON output
- No server communication (local only)

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `browser-extension/` directory
5. The extension icon will appear in your toolbar

**Note:** The extension references icon files (icon16.png, icon48.png, icon128.png) in manifest.json. These are optional - Chrome will use a default icon if they're not present. To add custom icons, create PNG files with those names in the `browser-extension/` directory.

## Usage

1. Navigate to any web page with a form (e.g., a job application page)
2. Click the extension icon in your toolbar
3. Click the "Scan Form Fields" button in the popup
4. View the extracted form field data in JSON format

## Development

### Files

- `manifest.json` - Extension configuration (Manifest V3)
- `popup.html` - Extension popup UI
- `popup.js` - Popup logic and content script injection
- `content.js` - Page scraping logic that extracts form field data

### How it works

1. User clicks "Scan Form Fields" button
2. `popup.js` injects `content.js` into the active tab
3. `content.js` scans the page for form fields and extracts metadata
4. Results are returned to `popup.js` and displayed as JSON

### Permissions

- `activeTab` - Access to the currently active tab
- `scripting` - Ability to inject content scripts

## Next Steps

- Add server communication to send form data to backend
- Implement form auto-fill functionality
- Add field mapping/configuration UI
- Store form templates for reuse
- Add support for multi-page forms
