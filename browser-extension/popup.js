// Get DOM elements
const scanButton = document.getElementById('scanButton');
const sendButton = document.getElementById('sendButton');
const fillButton = document.getElementById('fillButton');
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

    // Include edited job details in the data
    const dataToSend = {
      ...scannedData,
      jobDetails: {
        company_name: companyInput.value,
        role_title: roleInput.value,
        job_description: scannedData.jobDetails?.job_description || ''
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

// Handle fill form button click
fillButton.addEventListener('click', async () => {
  if (!backendResponse) {
    statusDiv.textContent = 'No backend response available. Please send to backend first.';
    statusDiv.className = 'status error';
    return;
  }

  try {
    // Disable button with loading indicator
    disableButtonWithLoading(fillButton, 'Filling...');
    statusDiv.textContent = 'Filling form...';
    statusDiv.className = 'status';

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.id) {
      throw new Error('No active tab found');
    }

    // Execute the fill function directly
    const fillValues = backendResponse.fill_values || {};
    const files = backendResponse.files || {};
    const fieldMappings = backendResponse.field_mappings || {};

    console.log('Filling form with values:', fillValues);
    console.log('Files to upload:', files);

    // Execute fillFormFields function directly by injecting it
    const fillResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (fillValues) => {
        // Define helper functions inline
        function getFieldType(element) {
          if (element.tagName === 'SELECT') return 'select';
          if (element.tagName === 'TEXTAREA') return 'textarea';
          if (element.tagName === 'INPUT') return element.type || 'text';
          return 'unknown';
        }

        // Fuzzy match helper function
        function fuzzyMatchOption(value, optionValue, optionText) {
          const val = String(value).toLowerCase().trim();
          const optVal = String(optionValue).toLowerCase().trim();
          const optTxt = String(optionText).toLowerCase().trim();

          if (val === optVal || val === optTxt) return true;

          const trueValues = ['true', 'yes', '1', 't', 'y'];
          const falseValues = ['false', 'no', '0', 'f', 'n'];

          if (trueValues.includes(val)) {
            return trueValues.includes(optVal) || trueValues.includes(optTxt);
          }
          if (falseValues.includes(val)) {
            return falseValues.includes(optVal) || falseValues.includes(optTxt);
          }

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

          return false;
        }

        // Fill the form fields
        const results = {
          filled: [],
          errors: [],
          notFound: []
        };

        for (const [fieldIdentifier, value] of Object.entries(fillValues)) {
          try {
            let element = document.getElementById(fieldIdentifier);
            if (!element) {
              element = document.querySelector(`[name="${fieldIdentifier}"]`);
            }
            if (!element && /^\d+$/.test(fieldIdentifier)) {
              const inputs = document.querySelectorAll('input, select, textarea');
              element = inputs[parseInt(fieldIdentifier)];
            }

            if (!element) {
              console.warn(`Field not found: ${fieldIdentifier}`);
              results.notFound.push(fieldIdentifier);
              continue;
            }

            const fieldType = getFieldType(element);

            if (fieldType === 'checkbox') {
              const val = String(value).toLowerCase().trim();
              const trueValues = ['true', 'yes', '1', 't', 'y'];
              const falseValues = ['false', 'no', '0', 'f', 'n'];

              if (value === true || trueValues.includes(val)) {
                element.checked = true;
                element.dispatchEvent(new Event('click', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                results.filled.push({ field: fieldIdentifier, type: 'checkbox', value: true });
              } else if (value === false || falseValues.includes(val)) {
                element.checked = false;
                element.dispatchEvent(new Event('click', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                results.filled.push({ field: fieldIdentifier, type: 'checkbox', value: false });
              }
            } else if (fieldType === 'radio') {
              const val = String(value).toLowerCase().trim();
              const trueValues = ['true', 'yes', '1', 't', 'y'];

              if (value === true || trueValues.includes(val)) {
                element.checked = true;
                element.dispatchEvent(new Event('click', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                results.filled.push({ field: fieldIdentifier, type: 'radio', value: true });
              }
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
                element.value = option.value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
                results.filled.push({ field: fieldIdentifier, type: 'select', value: option.text });
                console.log(`Set select: ${fieldIdentifier} = ${option.text} (matched from: ${value})`);
              } else {
                console.warn(`Option not found in select ${fieldIdentifier}:`, value);
                console.warn(`Available options:`, Array.from(element.options).map(o => `"${o.value}" / "${o.text}"`));
                results.errors.push({ field: fieldIdentifier, error: 'Option not found' });
              }
            } else {
              element.value = String(value);
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              results.filled.push({ field: fieldIdentifier, type: fieldType, value: value });
            }
          } catch (error) {
            console.error(`Error filling field ${fieldIdentifier}:`, error);
            results.errors.push({ field: fieldIdentifier, error: error.message });
          }
        }

        console.log('Fill results:', results);
        return results;
      },
      args: [fillValues]
    });

    const result = fillResults[0]?.result;

    // Handle file uploads
    let filesUploaded = 0;
    let filesErrors = 0;

    if (Object.keys(files).length > 0) {
      statusDiv.textContent = 'Uploading files...';

      // Find fields that need files
      const fileFields = {};
      for (const [fieldId, mapping] of Object.entries(fieldMappings)) {
        if (mapping === 'RESUME_UPLOAD' && files.resume) {
          fileFields[fieldId] = { type: 'resume', path: files.resume };
        } else if (mapping && mapping.startsWith('COVER_LETTER_') && files.cover_letter) {
          // Don't upload cover letter as file if it's already being used as text
          // (cover letter upload fields would have RESUME_UPLOAD or similar mapping, not COVER_LETTER_*)
        }
      }

      console.log('File fields to fill:', fileFields);

      // Upload files to each field
      for (const [fieldId, fileInfo] of Object.entries(fileFields)) {
        try {
          // Fetch file from server
          const fileUrl = `http://localhost:5050/api/get-file?path=${encodeURIComponent(fileInfo.path)}`;
          const response = await fetch(fileUrl);

          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
          }

          const blob = await response.blob();
          const filename = fileInfo.path.split('/').pop();
          const file = new File([blob], filename, { type: blob.type });

          console.log(`Attaching ${fileInfo.type} to field ${fieldId}:`, filename);

          // Inject file into the page
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (fieldId, fileData, filename, mimeType) => {
              // Find the file input
              let element = document.getElementById(fieldId);
              if (!element) {
                element = document.querySelector(`[name="${fieldId}"]`);
              }

              if (!element || element.type !== 'file') {
                console.warn(`File input not found: ${fieldId}`);
                return { success: false, error: 'Field not found' };
              }

              try {
                // Create a File object from the data
                const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
                const file = new File([blob], filename, { type: mimeType });

                // Create a DataTransfer to hold the file
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);

                // Set the files property
                element.files = dataTransfer.files;

                // Trigger events
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));

                console.log(`File attached to ${fieldId}:`, filename);
                return { success: true, filename };
              } catch (error) {
                console.error(`Error attaching file to ${fieldId}:`, error);
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
      const notFoundCount = result.notFound?.length || 0;
      const errorCount = result.errors?.length || 0;

      let statusParts = [];
      if (filledCount > 0) statusParts.push(`${filledCount} field${filledCount !== 1 ? 's' : ''} filled`);
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

  } catch (error) {
    console.error('Error filling form:', error);
    statusDiv.textContent = `Error: ${error.message}`;
    statusDiv.className = 'status error';
  } finally {
    // Re-enable button with 2-second cooldown
    await enableButtonWithCooldown(fillButton, 2000);
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
