// Extension version for debugging
const EXTENSION_VERSION = 'v2.0-20260116-2100';

// Capture all console logs for saving
const capturedLogs = [];
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function(...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  capturedLogs.push(`[${timestamp}] [POPUP] ${message}`);
  originalConsoleLog.apply(console, args);
};

console.warn = function(...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  capturedLogs.push(`[${timestamp}] [POPUP:WARN] ${message}`);
  originalConsoleWarn.apply(console, args);
};

console.error = function(...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  capturedLogs.push(`[${timestamp}] [POPUP:ERROR] ${message}`);
  originalConsoleError.apply(console, args);
};

console.log('🔧 Extension popup loaded:', EXTENSION_VERSION);

// Get DOM elements
const scanButton = document.getElementById('scanButton');
const sendButton = document.getElementById('sendButton');
const fillButton = document.getElementById('fillButton');
const saveLogsButton = document.getElementById('saveLogsButton');
const clearButton = document.getElementById('clearButton');
const statusDiv = document.getElementById('status');

// Collapsible sections
const scannedFieldsSection = document.getElementById('scannedFieldsSection');
const jobDetailsSection = document.getElementById('jobDetailsSection');
const resultsSection = document.getElementById('resultsSection');

// Content areas
const fieldsContent = document.getElementById('fieldsContent');
const resultsContent = document.getElementById('resultsContent');
const companyInput = document.getElementById('companyInput');
const roleInput = document.getElementById('roleInput');

// Store scanned data and backend response
let scannedData = null;
let backendResponse = null;
let currentTabId = null;

// Backend API endpoint
const BACKEND_URL = 'http://localhost:5050/api/match-fields';

/**
 * Helper: Detect new fields by comparing two scans
 * Returns fields in currentFields that weren't in previousFields
 */
function getNewFields(previousFields, currentFields) {
  const previousIds = new Set(previousFields.map(f => f.id));
  return currentFields.filter(f => !previousIds.has(f.id));
}

/**
 * Helper: Re-scan form fields by calling into content script via message passing
 * Returns only NEW field array (filters out previously scanned fields)
 * @param {number} tabId - Chrome tab ID
 * @param {Array} previousFieldIds - Array of field IDs to exclude from rescan
 */
async function rescanFormFields(tabId, previousFieldIds = []) {
  console.log(`📨 Sending rescanFormFields message (excluding ${previousFieldIds.length} previous fields)`);
  const response = await chrome.tabs.sendMessage(tabId, {
    action: 'rescanFormFields',
    previousFieldIds
  });
  console.log(`📥 Received ${response.fields?.length || 0} NEW fields from rescan`);
  return response.fields || [];
}

// Button state management with cooldown
const buttonStates = new Map(); // Track original text for each button

function disableButtonWithLoading(button, loadingText = 'Processing...') {
  if (!buttonStates.has(button)) {
    buttonStates.set(button, button.textContent);
  }
  button.disabled = true;
  button.textContent = loadingText;
}

async function enableButtonWithCooldown(button, cooldownMs = 2000) {
  // Restore original text
  const originalText = buttonStates.get(button) || button.textContent;
  button.textContent = originalText;

  // Wait for cooldown period before re-enabling
  await new Promise(resolve => setTimeout(resolve, cooldownMs));
  button.disabled = false;
}

// Collapsible section toggle
function setupCollapsibleSections() {
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.parentElement;
      section.classList.toggle('collapsed');
    });
  });
}

// Toggle section collapsed state
function toggleSection(section, collapsed) {
  if (collapsed) {
    section.classList.add('collapsed');
  } else {
    section.classList.remove('collapsed');
  }
}

// Display scanned fields
function displayScannedFields(data) {
  const { fields = [], actions = [] } = data;

  let html = `<div class="fields-summary">Found ${fields.length} field${fields.length !== 1 ? 's' : ''} and ${actions.length} action${actions.length !== 1 ? 's' : ''}</div>`;

  if (fields.length > 0) {
    html += '<div style="margin-top: 12px;">';
    fields.forEach((field, index) => {
      const label = field.label || '[No label]';
      const hint = field.hint || '';
      const type = field.type || 'unknown';
      const required = field.required ? ' (required)' : '';

      html += `
        <div class="field-item">
          <div class="field-label">${label}${required}</div>
          ${hint ? `<div class="field-meta">Hint: ${hint}</div>` : ''}
          <div class="field-meta">Type: ${type} | ID: ${field.id || index}</div>
        </div>
      `;
    });
    html += '</div>';
  }

  fieldsContent.innerHTML = html;
  scannedFieldsSection.classList.add('show');
  // Ensure section is expanded (not collapsed) when first populated
  toggleSection(scannedFieldsSection, false);
}

// Save current state to chrome.storage
async function saveState() {
  if (!currentTabId || !scannedData) return;

  const state = {
    tabId: currentTabId,
    scannedData: scannedData,
    backendResponse: backendResponse,
    jobDetails: {
      company_name: companyInput.value,
      role_title: roleInput.value
    },
    timestamp: Date.now()
  };

  const storageKey = `tabState_${currentTabId}`;
  await chrome.storage.local.set({ [storageKey]: state });
  console.log('State saved for tab', currentTabId);
}

// Load state from chrome.storage
async function loadState(tabId) {
  const storageKey = `tabState_${tabId}`;
  const result = await chrome.storage.local.get(storageKey);
  const state = result[storageKey];

  if (!state) {
    console.log('No saved state for tab', tabId);
    return false;
  }

  // Check if state is recent (within 24 hours)
  const age = Date.now() - state.timestamp;
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (age > maxAge) {
    console.log('Saved state is too old, ignoring');
    return false;
  }

  // Restore state
  scannedData = state.scannedData;
  backendResponse = state.backendResponse;

  // Restore UI
  if (scannedData) {
    const { fields = [], actions = [], jobDetails = {} } = scannedData;

    // Populate job details
    companyInput.value = state.jobDetails.company_name || jobDetails.company_name || '';
    roleInput.value = state.jobDetails.role_title || jobDetails.role_title || '';

    // Display scanned fields (expanded)
    displayScannedFields(scannedData);

    // Show job details section (expanded)
    jobDetailsSection.classList.add('show');
    toggleSection(jobDetailsSection, false);

    sendButton.classList.add('show');

    // Show status
    statusDiv.textContent = `Loaded previous scan`;
    statusDiv.className = 'status';
  }

  // Restore backend response if exists
  if (backendResponse) {
    displayStructuredResponse(backendResponse);
    fillButton.classList.add('show');

    const readyCount = Object.keys(backendResponse.fill_values || {}).length;
    const filesCount = Object.keys(backendResponse.files || {}).length;
    const needsCount = (backendResponse.needs_human || []).length;
    statusDiv.textContent = `${readyCount} ready, ${filesCount} files, ${needsCount} need input`;
    statusDiv.className = 'status success';

    // Collapse scanned fields section after backend response
    toggleSection(scannedFieldsSection, true);
  }

  console.log('State restored for tab', tabId);
  return true;
}

// Clear state
async function clearState() {
  if (!currentTabId) return;

  const storageKey = `tabState_${currentTabId}`;
  await chrome.storage.local.remove(storageKey);

  // Reset UI
  scannedData = null;
  backendResponse = null;
  companyInput.value = '';
  roleInput.value = '';
  scannedFieldsSection.classList.remove('show');
  jobDetailsSection.classList.remove('show');
  resultsSection.classList.remove('show');
  sendButton.classList.remove('show');
  fillButton.classList.remove('show');
  fieldsContent.innerHTML = '';
  resultsContent.innerHTML = '';
  statusDiv.textContent = '';
  statusDiv.className = 'status';

  console.log('State cleared for tab', currentTabId);
}

// Display structured response from backend
function displayStructuredResponse(data) {
  const { fill_values = {}, files = {}, needs_human = [], field_mappings = {} } = data;

  // Build field map for looking up labels
  const fieldMap = {};
  if (scannedData && scannedData.fields) {
    scannedData.fields.forEach((field, index) => {
      const fieldId = field.id || String(index);
      fieldMap[fieldId] = field.label || '[No label]';
    });
  }

  let html = '<div class="response-sections">';

  // Section 1: Ready to fill
  const fillKeys = Object.keys(fill_values);
  if (fillKeys.length > 0) {
    html += '<div class="response-section">';
    html += '<h3>✓ Ready to Fill (' + fillKeys.length + ')</h3>';
    html += '<ul>';
    fillKeys.forEach(fieldId => {
      const label = fieldMap[fieldId] || fieldId;
      const value = fill_values[fieldId];
      const displayValue = String(value).length > 100 ? String(value).substring(0, 100) + '...' : value;
      html += `<li><strong>${label}:</strong> ${displayValue}</li>`;
    });
    html += '</ul>';
    html += '</div>';
  }

  // Section 2: Files to upload
  const fileKeys = Object.keys(files);
  if (fileKeys.length > 0) {
    html += '<div class="response-section">';
    html += '<h3>📎 Files to Upload (' + fileKeys.length + ')</h3>';
    html += '<ul>';
    fileKeys.forEach(fileType => {
      const path = files[fileType];
      const fileName = path.split('/').pop();
      // Show actual filename from backend
      html += `<li><strong>${fileType}:</strong> ${fileName}</li>`;
    });
    html += '</ul>';
    html += '</div>';
  }

  // Section 3: Needs your input
  if (needs_human.length > 0) {
    html += '<div class="response-section">';
    html += '<h3>⚠️ Needs Your Input (' + needs_human.length + ')</h3>';
    html += '<ul>';
    needs_human.forEach(fieldId => {
      const label = fieldMap[fieldId] || fieldId;
      const mapping = field_mappings[fieldId] || 'unknown';
      html += `<li><strong>${label}</strong> <span class="mapping">(${mapping})</span></li>`;
    });
    html += '</ul>';
    html += '</div>';
  }

  html += '</div>';

  resultsContent.innerHTML = html;
  resultsSection.classList.add('show');
  // Ensure results section is expanded when populated
  toggleSection(resultsSection, false);
}

// Handle scan button click
scanButton.addEventListener('click', async () => {
  try {
    // Disable button during scan
    scanButton.disabled = true;
    sendButton.classList.remove('show');
    fillButton.classList.remove('show');
    statusDiv.textContent = 'Scanning...';
    statusDiv.className = 'status';

    // Clear scanned fields content (but keep section visible if already shown)
    fieldsContent.innerHTML = '';
    scannedData = null;

    // Don't clear job details or results - they stay visible from previous scans
    // Results section will be cleared only when new backend response arrives
    backendResponse = null;

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.id) {
      throw new Error('No active tab found');
    }

    // Update current tab ID
    currentTabId = tab.id;

    // Inject and execute the content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // The content script returns an object with fields and actions
    const scanData = results[0]?.result;

    if (!scanData) {
      throw new Error('No data returned from content script');
    }

    const { fields = [], actions = [], jobDetails = {} } = scanData;
    const totalItems = fields.length + actions.length;

    // Display results
    if (totalItems === 0) {
      statusDiv.textContent = 'No form fields or actions found on this page';
      statusDiv.className = 'status';
    } else {
      // Store scanned data
      scannedData = scanData;

      statusDiv.textContent = `Scan complete`;
      statusDiv.className = 'status success';

      // Display scanned fields
      displayScannedFields(scanData);

      // Populate job details fields
      companyInput.value = jobDetails.company_name || '';
      roleInput.value = jobDetails.role_title || '';

      // Show job details section (expanded)
      jobDetailsSection.classList.add('show');
      toggleSection(jobDetailsSection, false);

      // Show the send button
      sendButton.classList.add('show');

      // Save state
      await saveState();
    }

  } catch (error) {
    console.error('Error scanning form:', error);
    statusDiv.textContent = `Error: ${error.message}`;
    statusDiv.className = 'status error';
  } finally {
    // Re-enable button
    scanButton.disabled = false;
  }
});

// Save state when job details are edited
companyInput.addEventListener('change', saveState);
roleInput.addEventListener('change', saveState);

// Handle send to backend button click
sendButton.addEventListener('click', async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 SEND TO BACKEND BUTTON CLICKED');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Call stack:', new Error().stack);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!scannedData) {
    statusDiv.textContent = 'No scanned data available. Please scan first.';
    statusDiv.className = 'status error';
    return;
  }

  try {
    // Disable button with loading indicator
    disableButtonWithLoading(sendButton, 'Sending...');
    statusDiv.textContent = 'Sending to backend...';
    statusDiv.className = 'status';

    console.log('📤 Preparing to call /api/match-fields...');

    // Include edited job details in the data
    const dataToSend = {
      ...scannedData,
      jobDetails: {
        company_name: companyInput.value,
        role_title: roleInput.value,
        job_location: scannedData.jobDetails?.job_location || '',
        job_description: scannedData.jobDetails?.job_description || '',
        company_name_context: scannedData.jobDetails?.company_name_context || null
      }
    };

    console.log('Sending to:', BACKEND_URL);
    console.log('Data:', dataToSend);

    // Send POST request to backend
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToSend)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', [...response.headers.entries()]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response body:', errorText);
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const responseData = await response.json();

    // Store backend response
    backendResponse = responseData;

    // Display success message based on status
    if (responseData.status === 'complete') {
      const readyCount = Object.keys(responseData.fill_values || {}).length;
      const filesCount = Object.keys(responseData.files || {}).length;
      const needsCount = (responseData.needs_human || []).length;

      statusDiv.textContent = `Complete: ${readyCount} ready to fill, ${filesCount} files, ${needsCount} need input`;
      statusDiv.className = 'status success';

      // Show the Fill Form button
      fillButton.classList.add('show');
    } else {
      statusDiv.textContent = `Status: ${responseData.status}`;
      statusDiv.className = 'status';
    }

    // Display the response in structured sections
    displayStructuredResponse(responseData);

    // Collapse scanned fields section after backend response
    toggleSection(scannedFieldsSection, true);

    // Save state with backend response
    await saveState();

    console.log('Backend response:', responseData);

  } catch (error) {
    console.error('Error sending to backend:', error);

    // Check if it's a network error (server not running)
    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      statusDiv.textContent = 'Error: Backend server not running. Start server with: python server.py';
    } else {
      statusDiv.textContent = `Error: ${error.message}`;
    }
    statusDiv.className = 'status error';
  } finally {
    // Re-enable button with 2-second cooldown
    await enableButtonWithCooldown(sendButton, 2000);
  }
});

// Handle fill form button click with iterative conditional field support
fillButton.addEventListener('click', async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔘 FILL FORM BUTTON CLICKED');
  console.log('Timestamp:', new Date().toISOString());
  console.log('backendResponse exists?', !!backendResponse);
  console.log('scannedData exists?', !!scannedData);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!backendResponse || !scannedData) {
    console.error('❌ No backend response or scanned data - stopping fill');
    statusDiv.textContent = 'No backend response available. Please scan and send to backend first.';
    statusDiv.className = 'status error';
    return;
  }

  try {
    // Disable button with loading indicator
    disableButtonWithLoading(fillButton, 'Filling...');
    statusDiv.textContent = 'Filling form...';
    statusDiv.className = 'status';

    console.log('✓ backendResponse available, proceeding with fill');

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.id) {
      throw new Error('No active tab found');
    }

    console.log('✓ Active tab ID:', tab.id);

    // Iterative fill loop to handle conditional fields
    let previousFields = [];
    let currentFields = scannedData.fields || [];
    let iteration = 0;
    const MAX_ITERATIONS = 5; // Safety limit
    const filledFieldIds = new Set(); // Track already-filled fields across iterations

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`━━━ ITERATION ${iteration}/${MAX_ITERATIONS} ━━━`);
      console.log(`Current fields: ${currentFields.length}`);

      const newFields = getNewFields(previousFields, currentFields);
      console.log(`New fields detected: ${newFields.length}`);

      if (newFields.length === 0 && iteration > 1) {
        console.log('✅ No new fields detected, iteration complete.');
        break;
      }

      // On first iteration, use all fields. On subsequent iterations, use only new fields
      const fieldsToProcess = iteration === 1 ? currentFields : newFields;
      console.log(`Fields to process this iteration: ${fieldsToProcess.length}`);

      // On iteration 2+, send new fields to backend for matching
      if (iteration > 1 && newFields.length > 0) {
        console.log(`🔄 Iteration ${iteration}: Sending ${newFields.length} new fields to backend for matching...`);

        try {
          // Prepare job details (same as initial scan)
          const jobDetails = {
            company_name: companyInput.value || scannedData.jobDetails?.company_name || '',
            role_title: roleInput.value || scannedData.jobDetails?.role_title || '',
            job_location: scannedData.jobDetails?.job_location || '',
            job_description: scannedData.jobDetails?.job_description || '',
            company_name_context: scannedData.jobDetails?.company_name_context
          };

          // Send new fields to backend
          const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: newFields,
              actions: [],
              jobDetails: jobDetails
            })
          });

          if (!response.ok) {
            throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
          }

          const newBackendResponse = await response.json();
          console.log(`✅ Backend matched ${newFields.length} new fields:`, newBackendResponse);

          // Merge new mappings and values with existing ones
          Object.assign(backendResponse.field_mappings, newBackendResponse.field_mappings || {});
          Object.assign(backendResponse.fill_values, newBackendResponse.fill_values || {});
          Object.assign(backendResponse.files, newBackendResponse.files || {});
          backendResponse.needs_human = [...(backendResponse.needs_human || []), ...(newBackendResponse.needs_human || [])];

          console.log(`📊 Updated backend response with new field mappings`);
          console.log(`Total fill_values: ${Object.keys(backendResponse.fill_values).length}`);

        } catch (error) {
          console.error('❌ Error sending new fields to backend:', error);
          statusDiv.textContent = `Error matching new fields: ${error.message}`;
          statusDiv.className = 'status error';
          // Continue anyway - maybe some fields can still be filled
        }
      }

    // Execute the fill function directly
    const fillValues = backendResponse.fill_values || {};
    const files = backendResponse.files || {};
    const fieldMappings = backendResponse.field_mappings || {};

    console.log('📝 Filling form with values:', fillValues);
    console.log('📁 Files to upload:', files);

    // Prepare field metadata (options) for combobox handling
    const fieldMetadata = {};
    let fieldsWithOptions = 0;
    let fieldsWithoutOptions = 0;

    if (scannedData && scannedData.fields) {
      scannedData.fields.forEach(field => {
        if (field.options && field.options.length > 0) {
          fieldMetadata[field.id] = {
            options: field.options,
            label: field.label
          };
          fieldsWithOptions++;
          console.log(`✓ Field ${field.id} (${field.label}) has ${field.options.length} options`);
        } else if (field.type === 'combobox' || field.input_type === 'custom_select') {
          fieldsWithoutOptions++;
          console.warn(`⚠️ Combobox field ${field.id} (${field.label}) has NO options!`);
        }
      });
    }

    console.log(`📊 Field metadata summary: ${fieldsWithOptions} fields WITH options, ${fieldsWithoutOptions} comboboxes WITHOUT options`);
    console.log('Field metadata (with options):', fieldMetadata);

    // Execute fillFormFields function directly by injecting it
    const fillResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (fillValues, fieldMetadata, alreadyFilledFieldIds) => {
        console.log('=== FILL SCRIPT EXECUTING ===');
        console.log('Received fill values:', fillValues);
        console.log('Received field metadata:', fieldMetadata);
        console.log('Already filled field IDs:', alreadyFilledFieldIds);

        // Detect page navigation during fill
        let pageNavigated = false;
        const navigationDetector = () => {
          pageNavigated = true;
          console.error('⚠️⚠️⚠️ PAGE NAVIGATION DETECTED DURING FILL! ⚠️⚠️⚠️');
        };
        window.addEventListener('beforeunload', navigationDetector);
        window.addEventListener('unload', navigationDetector);

        // Define helper functions inline
        function getFieldType(element) {
          const role = element.getAttribute('role');
          if (role === 'combobox' || role === 'listbox') return 'combobox';
          if (element.tagName === 'SELECT') return 'select';
          if (element.tagName === 'TEXTAREA') return 'textarea';
          if (element.tagName === 'INPUT') return element.type || 'text';
          return 'unknown';
        }

        // Fuzzy match helper function with smart substring/token matching
        function fuzzyMatchOption(value, optionValue, optionText) {
          const val = String(value).toLowerCase().trim();
          const optVal = String(optionValue).toLowerCase().trim();
          const optTxt = String(optionText).toLowerCase().trim();

          // 1. Exact match
          if (val === optVal || val === optTxt) return true;

          // 2. Boolean variations
          const trueValues = ['true', 'yes', '1', 't', 'y'];
          const falseValues = ['false', 'no', '0', 'f', 'n'];

          if (trueValues.includes(val)) {
            return trueValues.includes(optVal) || trueValues.includes(optTxt);
          }
          if (falseValues.includes(val)) {
            return falseValues.includes(optVal) || falseValues.includes(optTxt);
          }

          // 3. Country variations
          const countryVariations = {
            'united states': ['us', 'usa', 'u.s.', 'u.s.a.', 'united states of america'],
            'united kingdom': ['uk', 'u.k.', 'great britain', 'gb'],
            'canada': ['ca', 'can']
          };

          for (const [canonical, variations] of Object.entries(countryVariations)) {
            if (val === canonical || variations.includes(val)) {
              if (optVal === canonical || variations.includes(optVal) ||
                  optTxt === canonical || variations.includes(optTxt)) {
                return true;
              }
            }
          }

          // 4. Gender/sexuality/identity synonyms
          const genderSexualityVariations = {
            'heterosexual': ['straight', 'hetero'],
            'homosexual': ['gay', 'lesbian'],
            'bisexual': ['bi'],
            'non-binary': ['nonbinary', 'non binary', 'enby', 'nb'],
            'transgender': ['trans'],
            'man': ['male'],
            'woman': ['female'],
            'prefer not to say': ['prefer not to answer', 'decline to state', 'decline']
          };

          for (const [canonical, variations] of Object.entries(genderSexualityVariations)) {
            if (val === canonical || variations.includes(val)) {
              if (optVal === canonical || variations.includes(optVal) ||
                  optTxt === canonical || variations.includes(optTxt)) {
                return true;
              }
            }
            // Also check reverse: if option is canonical and value is variation
            if (optVal === canonical || optTxt === canonical) {
              if (variations.includes(val)) {
                return true;
              }
            }
          }

          // 5. Simple substring match (but watch out for negation opposites)
          // e.g., "White" matches "White (Not Hispanic or Latino)"
          if (optTxt.includes(val) || val.includes(optTxt)) {
            // Remove parenthetical content before checking negation
            // Parentheses usually contain clarifications, not negations of the main value
            const valNoParens = val.replace(/\([^)]*\)/g, '').trim();
            const optNoParens = optTxt.replace(/\([^)]*\)/g, '').trim();

            // Remove all negation-related words and compare
            const cleanVal = valNoParens.replace(/\b(not|no|non|never)\b/gi, ' ').replace(/\s+/g, ' ').trim();
            const cleanOpt = optNoParens.replace(/\b(not|no|non|never)\b/gi, ' ').replace(/\s+/g, ' ').trim();

            // If they're the same after removing negation words
            if (cleanVal === cleanOpt || (cleanVal.length > 0 && cleanOpt.includes(cleanVal)) || (cleanOpt.length > 0 && cleanVal.includes(cleanOpt))) {
              // They differ only in negation - check if negation status matches
              const valHasNeg = /\b(not|no|non|never)\b/i.test(valNoParens);
              const optHasNeg = /\b(not|no|non|never)\b/i.test(optNoParens);

              if (valHasNeg !== optHasNeg) {
                return false; // Opposite meanings
              }
            }

            return true; // Substring match and safe
          }

          // 5. Extract content words for smarter matching
          const stopwords = ['a', 'an', 'the', 'i', 'am', 'is', 'or', 'and'];
          const valTokens = val.split(/\s+/).filter(t => t.length > 1 && !stopwords.includes(t));
          const optTokens = optTxt.split(/\s+/).filter(t => t.length > 1 && !stopwords.includes(t));

          // 6. For veteran/negation-heavy fields, check negation semantics
          // Only if both strings mention the same core concept (e.g., both contain "veteran")
          const hasSharedConcept = valTokens.some(vt =>
            optTokens.some(ot =>
              (vt.includes(ot) || ot.includes(vt)) &&
              !['not', 'no', 'non', 'never'].includes(vt) &&
              !['not', 'no', 'non', 'never'].includes(ot)
            )
          );

          if (hasSharedConcept) {
            // They're talking about the same thing - check if negation aligns
            const hasNegation = /\b(not|no|non|never)\b/.test(val);
            const optHasNegation = /\b(not|no|non|never)\b/.test(optTxt);

            // If they share a concept but differ on negation, they're opposites
            // e.g., "I am a veteran" vs "I am not a veteran"
            if (hasNegation !== optHasNegation) {
              return false;
            }
          }

          // 7. Token overlap for general matching
          if (valTokens.length > 0 && optTokens.length > 0) {
            const matchingTokens = valTokens.filter(vt =>
              optTokens.some(ot => ot.includes(vt) || vt.includes(ot))
            );
            const overlapRatio = matchingTokens.length / Math.min(valTokens.length, optTokens.length);
            if (overlapRatio >= 0.5) return true;
          }

          return false;
        }

        // Fill the form fields
        const results = {
          filled: [],
          errors: [],
          notFound: [],
          skipped: []
        };

        // Recreate Set from array passed in
        const alreadyFilled = new Set(alreadyFilledFieldIds || []);

        // Simple fill counter - logs each actual fill attempt
        let fillCount = 0;

        console.log('Starting to fill', Object.keys(fillValues).length, 'fields');
        console.log('Already filled from previous iterations:', alreadyFilled.size);

        for (const [fieldIdentifier, value] of Object.entries(fillValues)) {
          // Skip if already filled in a previous iteration
          if (alreadyFilled.has(fieldIdentifier)) {
            console.log('⏭️ Skipping already-filled field:', fieldIdentifier);
            results.skipped.push(fieldIdentifier);
            continue;
          }

          try {
            // Increment and log BEFORE fill attempt
            fillCount++;
            console.log(`📊 FILL #${fillCount}: ${fieldIdentifier}`);
            console.log('🔍 [CHECKPOINT:fillForm:ProcessingField]', { fieldIdentifier, value });

            let element = document.getElementById(fieldIdentifier);
            let lookupMethod = 'getElementById';

            if (!element) {
              element = document.querySelector(`[name="${fieldIdentifier}"]`);
              lookupMethod = 'querySelector[name]';
            }
            if (!element && /^\d+$/.test(fieldIdentifier)) {
              const inputs = document.querySelectorAll('input, select, textarea');
              element = inputs[parseInt(fieldIdentifier)];
              lookupMethod = 'index';
            }
            // Try to find button group containers
            if (!element) {
              element = document.querySelector(`[role="radiogroup"][id="${fieldIdentifier}"], [role="group"][id="${fieldIdentifier}"], [data-field-id="${fieldIdentifier}"], [data-question-id="${fieldIdentifier}"]`);
              lookupMethod = 'querySelector[role]';
            }

            if (!element) {
              console.log('❌ [CHECKPOINT:fillForm:ElementNotFound]', { fieldIdentifier, triedMethods: ['getElementById', 'querySelector[name]', 'index', 'querySelector[role]'] });
              results.notFound.push(fieldIdentifier);
              continue;
            }

            console.log('✅ [CHECKPOINT:fillForm:ElementFound]', {
              fieldIdentifier,
              lookupMethod,
              elementTag: element.tagName,
              elementType: element.type,
              elementRole: element.getAttribute('role')
            });

            // Skip if this element is or contains a file input - files are handled separately
            const isFileInput = element.type === 'file';
            const containsFileInput = element.querySelector && element.querySelector('input[type="file"]') !== null;
            if (isFileInput || containsFileInput) {
              console.log('⏭️ [CHECKPOINT:fillForm:SkippingFileContainer]', {
                fieldIdentifier,
                reason: isFileInput ? 'Element is file input' : 'Element contains file input'
              });
              continue;
            }

            // Check if this is a button group (either by ID prefix or by having button children)
            const buttonCount = element.querySelectorAll('button:not([type="submit"]), [role="button"], [role="radio"]').length;
            const isButtonGroup = fieldIdentifier.startsWith('button_group_') || buttonCount >= 2;

            // Check if this is a combobox (by ID prefix or role attribute)
            const isCombobox = fieldIdentifier.startsWith('combobox_') ||
                              element.getAttribute('role') === 'combobox' ||
                              element.getAttribute('role') === 'listbox';

            let fieldType;
            if (isButtonGroup) {
              fieldType = 'button_group';
            } else if (isCombobox) {
              fieldType = 'combobox';
            } else {
              fieldType = getFieldType(element);
            }

            console.log('🔍 [CHECKPOINT:fillForm:TypeDetection]', {
              fieldIdentifier,
              detectedType: fieldType,
              checks: {
                startsWithButtonGroup: fieldIdentifier.startsWith('button_group_'),
                buttonCount,
                isButtonGroup,
                startsWithCombobox: fieldIdentifier.startsWith('combobox_'),
                role: element.getAttribute('role'),
                isCombobox
              }
            });

            // Skip file inputs during text filling - they will be handled in file upload step
            if (fieldType === 'file') {
              console.log('⏭️ [CHECKPOINT:fillForm:SkippingFileInput]', { fieldIdentifier, reason: 'File inputs handled separately' });
              continue;
            }

            if (fieldType === 'checkbox') {
              const val = String(value).toLowerCase().trim();
              const trueValues = ['true', 'yes', '1', 't', 'y'];
              const falseValues = ['false', 'no', '0', 'f', 'n'];

              element.focus();

              if (value === true || trueValues.includes(val)) {
                if (!element.checked) {
                  element.checked = true;
                  element.dispatchEvent(new Event('click', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                }
                results.filled.push({ field: fieldIdentifier, type: 'checkbox', value: true });
                alreadyFilled.add(fieldIdentifier);
              } else if (value === false || falseValues.includes(val)) {
                if (element.checked) {
                  element.checked = false;
                  element.dispatchEvent(new Event('click', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                }
                results.filled.push({ field: fieldIdentifier, type: 'checkbox', value: false });
                alreadyFilled.add(fieldIdentifier);
              }

              element.blur();
            } else if (fieldType === 'radio') {
              const val = String(value).toLowerCase().trim();
              const trueValues = ['true', 'yes', '1', 't', 'y'];

              element.focus();

              if (value === true || trueValues.includes(val)) {
                element.checked = true;
                element.dispatchEvent(new Event('click', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                results.filled.push({ field: fieldIdentifier, type: 'radio', value: true });
                alreadyFilled.add(fieldIdentifier);
              }

              element.blur();
            } else if (fieldType === 'select') {
              let option = Array.from(element.options).find(opt =>
                opt.value === String(value) || opt.text === String(value)
              );

              if (!option) {
                option = Array.from(element.options).find(opt =>
                  fuzzyMatchOption(value, opt.value, opt.text)
                );
              }

              if (option) {
                element.focus();
                element.value = option.value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
                element.blur();
                results.filled.push({ field: fieldIdentifier, type: 'select', value: option.text });
                alreadyFilled.add(fieldIdentifier);
                console.log(`Set select: ${fieldIdentifier} = ${option.text} (matched from: ${value})`);
              } else {
                console.warn(`Option not found in select ${fieldIdentifier}:`, value);
                console.warn(`Available options:`, Array.from(element.options).map(o => `"${o.value}" / "${o.text}"`));
                results.errors.push({ field: fieldIdentifier, error: 'Option not found' });
              }
            } else if (fieldType === 'button_group') {
              // Handle button-based option groups
              console.log('🔍 [CHECKPOINT:fillForm:ButtonGroup:Entry]', { fieldIdentifier, value });

              const buttons = element.querySelectorAll('button:not([type="submit"]), [role="radio"], [role="button"]');
              const buttonTexts = Array.from(buttons).map(b => b.textContent.trim());

              console.log('🔍 [CHECKPOINT:fillForm:ButtonGroup:ButtonsFound]', {
                fieldIdentifier,
                buttonCount: buttons.length,
                buttonTexts: buttonTexts
              });

              let matchedButton = null;

              // Try exact match first
              for (const btn of buttons) {
                const btnValue = btn.getAttribute('value') || btn.getAttribute('data-value') || btn.textContent.trim();
                const btnText = btn.textContent.trim();

                if (btnValue === String(value) || btnText === String(value)) {
                  matchedButton = btn;
                  console.log('🔍 [CHECKPOINT:fillForm:ButtonGroup:ExactMatch]', { matched: btnText, value });
                  break;
                }
              }

              // Try fuzzy match
              if (!matchedButton) {
                console.log('🔍 [CHECKPOINT:fillForm:ButtonGroup:TryingFuzzyMatch]', { value });
                for (const btn of buttons) {
                  const btnValue = btn.getAttribute('value') || btn.getAttribute('data-value') || btn.textContent.trim();
                  const btnText = btn.textContent.trim();

                  if (fuzzyMatchOption(value, btnValue, btnText)) {
                    matchedButton = btn;
                    console.log('🔍 [CHECKPOINT:fillForm:ButtonGroup:FuzzyMatch]', { matched: btnText, value });
                    break;
                  }
                }
              }

              if (matchedButton) {
                console.log('🔍 [CHECKPOINT:fillForm:ButtonGroup:ClickingButton]', {
                  fieldIdentifier,
                  buttonText: matchedButton.textContent.trim(),
                  value
                });

                // Simulate real user interaction
                matchedButton.focus();
                matchedButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                matchedButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                matchedButton.click();
                matchedButton.dispatchEvent(new Event('change', { bubbles: true }));
                matchedButton.blur();

                results.filled.push({ field: fieldIdentifier, type: 'button_group', value: matchedButton.textContent.trim() });
                alreadyFilled.add(fieldIdentifier);
                console.log('✅ [CHECKPOINT:fillForm:ButtonGroup:Success]', {
                  fieldIdentifier,
                  clicked: matchedButton.textContent.trim()
                });
              } else {
                console.log('❌ [CHECKPOINT:fillForm:ButtonGroup:NoMatch]', {
                  fieldIdentifier,
                  searchValue: value,
                  availableButtons: buttonTexts
                });
                results.errors.push({ field: fieldIdentifier, error: 'Button not found' });
              }
            } else if (fieldType === 'combobox') {
              // Handle ARIA combobox using pre-extracted options from scan
              console.log('🔍 [CHECKPOINT:fillForm:Combobox:Entry]', { fieldIdentifier, value });

              // Get pre-extracted options from field metadata
              const metadata = fieldMetadata[fieldIdentifier];

              if (!metadata || !metadata.options || metadata.options.length === 0) {
                // No pre-extracted options - try autocomplete pattern for dynamic dropdowns
                console.log('🔍 [CHECKPOINT:fillForm:Combobox:TryingAutocomplete]', { fieldIdentifier, value });

                try {
                  const input = element.querySelector('input') || element;

                  // Step 1: Focus the input
                  input.focus();

                  // Step 2: Type the value using native setter
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                  if (nativeInputValueSetter) {
                    nativeInputValueSetter.call(input, String(value));
                  } else {
                    input.value = String(value);
                  }

                  // Step 3: Dispatch input event (triggers autocomplete fetch)
                  input.dispatchEvent(new Event('input', { bubbles: true }));

                  // Step 4: Wait for suggestions to load
                  await new Promise(resolve => setTimeout(resolve, 400));

                  // Step 5: Check if suggestions/listbox appeared
                  const listboxId = element.getAttribute('aria-controls') || input.getAttribute('aria-controls');
                  let listbox = listboxId ? document.getElementById(listboxId) : null;

                  if (!listbox) {
                    // Find visible listbox
                    const visibleListboxes = Array.from(document.querySelectorAll('[role="listbox"], [role="menu"]'))
                      .filter(lb => {
                        const style = window.getComputedStyle(lb);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                      });
                    listbox = visibleListboxes[0];
                  }

                  // Step 6: If suggestions exist, click first matching one
                  if (listbox) {
                    const options = listbox.querySelectorAll('[role="option"]');
                    console.log(`🔍 [CHECKPOINT:fillForm:Combobox:AutocompleteSuggestions] Found ${options.length} suggestions`);

                    if (options.length > 0) {
                      // Look for option that contains our value
                      let matchedOption = null;
                      const searchValue = String(value).toLowerCase();

                      for (const opt of options) {
                        const optText = opt.textContent.trim().toLowerCase();
                        if (optText.includes(searchValue) || searchValue.includes(optText)) {
                          matchedOption = opt;
                          break;
                        }
                      }

                      // Click matched option or first option if no match
                      const optionToClick = matchedOption || options[0];
                      optionToClick.click();
                      console.log('✅ [CHECKPOINT:fillForm:Combobox:ClickedSuggestion]', optionToClick.textContent.trim());
                    } else {
                      console.log('🔍 [CHECKPOINT:fillForm:Combobox:NoSuggestions] Accepting typed value');
                    }
                  } else {
                    // Step 7: No suggestions - leave typed value (many forms accept it)
                    console.log('🔍 [CHECKPOINT:fillForm:Combobox:NoListbox] Accepting typed value');
                  }

                  // Dispatch remaining events
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  input.blur();

                  results.filled.push({ field: fieldIdentifier, type: 'combobox', value: value });
                  alreadyFilled.add(fieldIdentifier);
                  console.log('✅ [CHECKPOINT:fillForm:Combobox:AutocompleteSuccess]', { fieldIdentifier, value });

                } catch (error) {
                  console.error('❌ [CHECKPOINT:fillForm:Combobox:AutocompleteError]', error);
                  results.errors.push({ field: fieldIdentifier, error: 'Autocomplete failed: ' + error.message });
                }
              } else {
                console.log('🔍 [CHECKPOINT:fillForm:Combobox:UsingPreExtractedOptions]', {
                  fieldIdentifier,
                  optionCount: metadata.options.length,
                  first5: metadata.options.slice(0, 5).map(o => o.text)
                });

                // Find matching option using fuzzy matching
                let matchedOption = null;

                // Try exact match first
                for (const opt of metadata.options) {
                  if (opt.value === String(value) || opt.text === String(value)) {
                    matchedOption = opt;
                    console.log('🔍 [CHECKPOINT:fillForm:Combobox:ExactMatch]', { text: opt.text });
                    break;
                  }
                }

                // Try fuzzy match if exact match not found
                if (!matchedOption) {
                  for (const opt of metadata.options) {
                    if (fuzzyMatchOption(value, opt.value, opt.text)) {
                      matchedOption = opt;
                      console.log('🔍 [CHECKPOINT:fillForm:Combobox:FuzzyMatch]', { text: opt.text, value });
                      break;
                    }
                  }
                }

                if (matchedOption) {
                  console.log('🔍 [CHECKPOINT:fillForm:Combobox:FillingValue]', {
                    fieldIdentifier,
                    matchedValue: matchedOption.value,
                    matchedText: matchedOption.text
                  });

                  // Try to find associated input field
                  const input = element.querySelector('input') || element;

                  // Check if this is a searchable dropdown (has input field and aria-autocomplete)
                  const isSearchable = input.tagName === 'INPUT' &&
                                      (element.getAttribute('aria-autocomplete') === 'list' ||
                                       input.getAttribute('aria-autocomplete') === 'list' ||
                                       element.getAttribute('role') === 'combobox');

                  if (isSearchable) {
                    console.log('🔍 [CHECKPOINT:fillForm:Combobox:SearchableDropdown] Using click-type-select pattern');

                    // For searchable dropdowns (like Greenhouse): click → type → select
                    try {
                      // Step 1: Click/focus to open dropdown
                      input.focus();
                      input.click();

                      // Wait briefly for dropdown to open
                      await new Promise(resolve => setTimeout(resolve, 100));

                      // Step 2: Type the value to filter options
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                      if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(input, matchedOption.text);
                      } else {
                        input.value = matchedOption.text;
                      }

                      // Trigger input event to filter the dropdown
                      input.dispatchEvent(new Event('input', { bubbles: true }));
                      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

                      // Wait for filtering
                      await new Promise(resolve => setTimeout(resolve, 200));

                      // Step 3: Find and click the matching option in the dropdown
                      const listboxId = element.getAttribute('aria-controls') || input.getAttribute('aria-controls');
                      let listbox = listboxId ? document.getElementById(listboxId) : null;

                      if (!listbox) {
                        // Find visible listbox
                        const visibleListboxes = Array.from(document.querySelectorAll('[role="listbox"], [role="menu"]'))
                          .filter(lb => {
                            const style = window.getComputedStyle(lb);
                            return style.display !== 'none' && style.visibility !== 'hidden';
                          });
                        listbox = visibleListboxes[0];
                      }

                      if (listbox) {
                        const options = listbox.querySelectorAll('[role="option"]');
                        console.log(`🔍 [CHECKPOINT:fillForm:Combobox:FoundOptions] ${options.length} options in dropdown`);

                        // Click the first matching option (should be filtered to one result)
                        if (options.length > 0) {
                          options[0].click();
                          console.log('✅ [CHECKPOINT:fillForm:Combobox:ClickedOption]', options[0].textContent.trim());
                        }
                      }

                      // Blur to close dropdown
                      input.blur();

                    } catch (error) {
                      console.error('❌ [CHECKPOINT:fillForm:Combobox:SearchableError]', error);
                      // Fallback to simple value set
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                      if (input.tagName === 'INPUT' && nativeInputValueSetter) {
                        nativeInputValueSetter.call(input, matchedOption.value);
                      } else {
                        input.value = matchedOption.value;
                      }
                      input.dispatchEvent(new Event('input', { bubbles: true }));
                      input.dispatchEvent(new Event('change', { bubbles: true }));
                      input.blur();
                    }
                  } else {
                    console.log('🔍 [CHECKPOINT:fillForm:Combobox:NonSearchable] Using direct value set');

                    // For non-searchable comboboxes: use native setter pattern
                    element.focus();

                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                    if (input.tagName === 'INPUT' && nativeInputValueSetter) {
                      nativeInputValueSetter.call(input, matchedOption.value);
                    } else {
                      input.value = matchedOption.value;
                    }

                    // Trigger events to notify React
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.blur();
                  }

                  results.filled.push({ field: fieldIdentifier, type: 'combobox', value: matchedOption.value });
                  alreadyFilled.add(fieldIdentifier);
                  console.log('✅ [CHECKPOINT:fillForm:Combobox:Success]', {
                    fieldIdentifier,
                    setValue: matchedOption.value,
                    matchedText: matchedOption.text
                  });
                } else {
                  console.warn('❌ [CHECKPOINT:fillForm:Combobox:NoMatch]', {
                    value,
                    availableOptions: metadata.options.slice(0, 10).map(o => o.text)
                  });
                  results.errors.push({ field: fieldIdentifier, error: 'Option not found' });
                }
              }
            } else {
              // Comprehensive event triggering for modern frameworks (React, Vue, Angular)
              // Focus the field first
              element.focus();

              // Set the value using native setter if available (bypasses React controlled component issues)
              try {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

                if (element.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                  nativeTextAreaValueSetter.call(element, String(value));
                } else if (element.tagName === 'INPUT' && nativeInputValueSetter) {
                  nativeInputValueSetter.call(element, String(value));
                } else {
                  element.value = String(value);
                }
              } catch (e) {
                // Fallback to simple value set if native setter fails
                element.value = String(value);
              }

              // Trigger events in the right order for React/Vue
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              element.dispatchEvent(new Event('blur', { bubbles: true }));

              // Blur to trigger validation
              element.blur();

              results.filled.push({ field: fieldIdentifier, type: fieldType, value: value });
              alreadyFilled.add(fieldIdentifier);
            }
          } catch (error) {
            console.error(`Error filling field ${fieldIdentifier}:`, error);
            results.errors.push({ field: fieldIdentifier, error: error.message });
          }
        }

        // Clean up navigation detector
        window.removeEventListener('beforeunload', navigationDetector);
        window.removeEventListener('unload', navigationDetector);

        if (pageNavigated) {
          console.error('⚠️ PAGE NAVIGATED DURING FILL - This may cause state loss and trigger rescan!');
        }

        console.log('Fill results:', results);
        console.log('Filled field IDs:', Array.from(alreadyFilled));

        // Return results with updated filledFieldIds
        return {
          ...results,
          filledFieldIds: Array.from(alreadyFilled)
        };
      },
      args: [fillValues, fieldMetadata, Array.from(filledFieldIds)]
    });

    console.log('Fill script completed. Results:', fillResults);
    const result = fillResults[0]?.result;
    console.log('Extracted result:', result);

    // Update filledFieldIds Set with newly filled fields
    if (result?.filledFieldIds) {
      result.filledFieldIds.forEach(id => filledFieldIds.add(id));
      console.log(`📊 Total filled fields across all iterations: ${filledFieldIds.size}`);
    }

    // Handle file uploads (only on first iteration)
    let filesUploaded = 0;
    let filesErrors = 0;

    if (Object.keys(files).length > 0 && iteration === 1) {
      console.log('📎 Uploading files (iteration 1 only)...');
      statusDiv.textContent = 'Uploading files...';

      // Detect file type from field metadata (label, name, hint)
      function detectFileType(field) {
        if (!field) return 'resume';

        // Check label/name/hint text
        const text = `${field.label || ''} ${field.name || ''} ${field.hint || ''}`.toLowerCase();

        // Cover letter patterns
        if (text.includes('cover') || text.includes('motivation')) {
          return 'cover_letter';
        }

        // Resume/CV patterns (default)
        return 'resume';
      }

      // Find fields that need files - check ALL file input fields from scannedData
      const fileFields = {};
      const usedFiles = { resume: false, cover_letter: false };

      // Iterate through all scanned fields and find file inputs
      if (scannedData.fields) {
        for (const field of scannedData.fields) {
          if (field.type === 'file') {
            const fieldId = field.id || field.name;
            if (!fieldId) continue;

            // First, check backend mapping as a hint
            const mapping = fieldMappings[fieldId];
            let fileType = null;

            if (mapping === 'RESUME_UPLOAD' && files.resume && !usedFiles.resume) {
              fileType = 'resume';
              usedFiles.resume = true;
            } else {
              // Use label detection
              const detectedType = detectFileType(field);

              if (detectedType === 'cover_letter' && files.cover_letter && !usedFiles.cover_letter) {
                fileType = 'cover_letter';
                usedFiles.cover_letter = true;
              } else if (detectedType === 'resume' && files.resume && !usedFiles.resume) {
                fileType = 'resume';
                usedFiles.resume = true;
              }
            }

            if (fileType) {
              fileFields[fieldId] = { type: fileType, path: files[fileType] };
              console.log(`Mapping file upload: field "${fieldId}" (label: "${field.label}", mapping: "${mapping}") -> ${fileType} (${files[fileType]})`);
            }
          }
        }

        // Second pass: if we have unused files, assign them to remaining file inputs
        for (const field of scannedData.fields) {
          if (field.type === 'file') {
            const fieldId = field.id || field.name;
            if (!fieldId || fileFields[fieldId]) continue; // Skip if already assigned

            // Assign unused cover letter if available
            if (files.cover_letter && !usedFiles.cover_letter) {
              fileFields[fieldId] = { type: 'cover_letter', path: files.cover_letter };
              usedFiles.cover_letter = true;
              console.log(`Mapping file upload (second pass): field "${fieldId}" -> cover letter (${files.cover_letter})`);
            } else if (files.resume && !usedFiles.resume) {
              // Assign unused resume if available
              fileFields[fieldId] = { type: 'resume', path: files.resume };
              usedFiles.resume = true;
              console.log(`Mapping file upload (second pass): field "${fieldId}" -> resume (${files.resume})`);
            }
          }
        }
      }

      console.log('File fields to fill:', fileFields);
      console.log('Field mappings:', fieldMappings);

      // Upload files to each field
      for (const [fieldId, fileInfo] of Object.entries(fileFields)) {
        try {
          // Fetch file from server
          const fileUrl = `http://localhost:5050/api/get-file?path=${encodeURIComponent(fileInfo.path)}`;
          console.log(`[FILE] Fetching:`, fileUrl);

          const response = await fetch(fileUrl);
          console.log(`[FILE] Fetch response:`, response.status, response.ok);

          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
          }

          const blob = await response.blob();
          console.log(`[FILE] Blob size:`, blob.size, 'type:', blob.type);

          const filename = fileInfo.path.split('/').pop();
          const file = new File([blob], filename, { type: blob.type });

          console.log(`[FILE] Attaching ${fileInfo.type} to field ${fieldId}:`, filename);
          console.log(`[FILE] Injecting for field:`, fieldId, 'filename:', filename);

          // Inject file into the page
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (fieldId, fileData, filename, mimeType) => {
              console.log(`[FILE INJECT] Starting for:`, fieldId);
              console.log(`[FILE UPLOAD] Looking for file input with id: ${fieldId}`);

              // Strategy 1: Direct lookup by ID
              let element = document.getElementById(fieldId);
              console.log(`[FILE INJECT] Found element:`, !!element, element?.type);
              console.log(`[FILE UPLOAD] getElementById result:`, element?.tagName, element?.type);

              // Strategy 2: If not found or not a file input, search more broadly
              if (!element || element.type !== 'file') {
                // Look for file input by name
                const byName = document.querySelector(`input[type="file"][name="${fieldId}"]`);
                if (byName) {
                  console.log(`[FILE UPLOAD] Found by name attribute`);
                  element = byName;
                }
              }

              // Strategy 3: If element found but not file input, look for nearby file input
              if (element && element.type !== 'file') {
                console.log(`[FILE UPLOAD] Found element but not file input, searching nearby...`);

                // Look inside the element (if it's a container)
                let fileInput = element.querySelector('input[type="file"]');

                // Look in parent container
                if (!fileInput && element.parentElement) {
                  fileInput = element.parentElement.querySelector('input[type="file"]');
                }

                // Look in siblings
                if (!fileInput && element.parentElement) {
                  const siblings = Array.from(element.parentElement.children);
                  fileInput = siblings.find(el => el.tagName === 'INPUT' && el.type === 'file');
                }

                if (fileInput) {
                  console.log(`[FILE UPLOAD] Found actual file input nearby:`, fileInput.id || fileInput.name);
                  element = fileInput;
                }
              }

              // Final validation
              if (!element || element.type !== 'file') {
                console.error(`[FILE UPLOAD] ❌ Could not find file input for: ${fieldId}`);
                return { success: false, error: 'File input not found' };
              }

              console.log(`[FILE UPLOAD] ✓ Using file input:`, element.id || element.name, element);

              try {
                console.log(`[FILE UPLOAD] Attempting to attach file to ${fieldId}:`, filename);

                // Create a File object from the data
                const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
                const file = new File([blob], filename, { type: mimeType });

                console.log(`[FILE UPLOAD] Created file object:`, { name: file.name, size: file.size, type: file.type });

                // Create a DataTransfer to hold the file
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);

                console.log(`[FILE UPLOAD] DataTransfer files count:`, dataTransfer.files.length);

                // Set the files property on the input element
                element.files = dataTransfer.files;

                console.log(`[FILE INJECT] Files set, count:`, element.files.length);
                console.log(`[FILE UPLOAD] Set element.files, count:`, element.files.length);

                // Verify file was set
                if (element.files.length > 0) {
                  console.log(`[FILE UPLOAD] ✅ Successfully attached file:`, element.files[0].name);

                  // Dispatch change event to update React UI
                  // This does NOT open the file picker (tested directly)
                  // The picker was caused by clicking the "Attach" button, which we now skip
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  console.log(`[FILE UPLOAD] Dispatched change event`);

                  return { success: true, filename: element.files[0].name };
                } else {
                  console.error(`[FILE UPLOAD] ❌ File not attached - element.files is empty`);
                  return { success: false, error: 'File not attached to element' };
                }
              } catch (error) {
                console.error(`[FILE UPLOAD] ❌ Error:`, error);
                return { success: false, error: error.message };
              }
            },
            args: [fieldId, Array.from(new Uint8Array(await blob.arrayBuffer())), filename, blob.type]
          });

          filesUploaded++;
        } catch (error) {
          console.error(`Error uploading file to ${fieldId}:`, error);
          filesErrors++;
        }
      }
    }

    if (result) {
      const filledCount = result.filled?.length || 0;
      const skippedCount = result.skipped?.length || 0;
      const notFoundCount = result.notFound?.length || 0;
      const errorCount = result.errors?.length || 0;

      let statusParts = [];
      if (filledCount > 0) statusParts.push(`${filledCount} field${filledCount !== 1 ? 's' : ''} filled`);
      if (skippedCount > 0) statusParts.push(`${skippedCount} skipped`);
      if (filesUploaded > 0) statusParts.push(`${filesUploaded} file${filesUploaded !== 1 ? 's' : ''} uploaded`);
      if (notFoundCount > 0) statusParts.push(`${notFoundCount} not found`);
      if (errorCount > 0 || filesErrors > 0) statusParts.push(`${errorCount + filesErrors} error${(errorCount + filesErrors) !== 1 ? 's' : ''}`);

      if (statusParts.length > 0) {
        statusDiv.textContent = statusParts.join(', ');
        statusDiv.className = 'status success';
      } else {
        statusDiv.textContent = 'No fields were filled. Check console for details.';
        statusDiv.className = 'status';
      }

      console.log('Fill results:', result);
    } else {
      statusDiv.textContent = 'Form filled (no result returned)';
      statusDiv.className = 'status';
    }

      // Wait briefly for conditional fields to appear after filling
      console.log('⏳ Waiting 500ms for conditional fields to appear...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Rescan for new fields (pass previous field IDs to filter them out)
      console.log('🔄 Rescanning form fields...');
      previousFields = currentFields;
      const previousFieldIds = previousFields.map(f => f.id);
      const newFieldsOnly = await rescanFormFields(tab.id, previousFieldIds);

      // Combine previous fields with new fields for next iteration
      currentFields = [...previousFields, ...newFieldsOnly];
      console.log(`Rescan complete. Previous: ${previousFields.length}, New: ${newFieldsOnly.length}, Total: ${currentFields.length}`);
    } // End of while loop

    // Verify state is still intact after fill
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ FILL FORM COMPLETED (${iteration} iteration${iteration !== 1 ? 's' : ''})`);
    console.log('State check after fill:');
    console.log('  - scannedData still exists?', !!scannedData);
    console.log('  - backendResponse still exists?', !!backendResponse);
    console.log('NO backend API calls were made (only file fetches)');
    console.log('If /api/match-fields was called, check for page navigation or state loss');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ FILL FORM ERROR:', error);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    statusDiv.textContent = `Error: ${error.message}`;
    statusDiv.className = 'status error';
  } finally {
    // Re-enable button with 2-second cooldown
    await enableButtonWithCooldown(fillButton, 2000);
  }
});

// Handle save logs button click
saveLogsButton.addEventListener('click', async () => {
  try {
    // Get active tab to collect content script logs
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Try to get content script logs (if content script is running)
    let contentLogs = [];
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Return all console logs from content script if captured
          return window.capturedContentLogs || [];
        }
      });
      contentLogs = result[0]?.result || [];
    } catch (e) {
      console.warn('Could not retrieve content script logs:', e);
    }

    // Combine popup and content logs
    const allLogs = [
      '=== EXTENSION LOGS ===',
      '',
      '--- POPUP LOGS ---',
      ...capturedLogs,
      '',
      '--- CONTENT/PAGE LOGS ---',
      ...contentLogs
    ].join('\n');

    // Send to backend to save
    const response = await fetch('http://localhost:5050/api/save-session-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: allLogs })
    });

    if (response.ok) {
      statusDiv.textContent = `Logs saved to logs/extension.log (${capturedLogs.length} popup logs, ${contentLogs.length} content logs)`;
      statusDiv.className = 'status success';
      console.log(`✅ Saved ${capturedLogs.length + contentLogs.length} log entries to extension.log`);
    } else {
      throw new Error(`Backend returned ${response.status}`);
    }
  } catch (error) {
    console.error('Error saving logs:', error);
    statusDiv.textContent = `Error saving logs: ${error.message}`;
    statusDiv.className = 'status error';
  }
});

// Handle clear button click
clearButton.addEventListener('click', async () => {
  if (confirm('Clear all scanned data for this tab?')) {
    await clearState();
    statusDiv.textContent = 'Data cleared. Click "Scan Form Fields" to start over.';
    statusDiv.className = 'status';
  }
});

// Initialize: Load saved state when popup opens
(async function init() {
  console.log('Form scanner popup loaded');

  // Setup collapsible sections
  setupCollapsibleSections();

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      currentTabId = tab.id;
      console.log('Current tab ID:', currentTabId);

      // Try to load saved state
      await loadState(currentTabId);
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
})();
