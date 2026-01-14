// Get DOM elements
const scanButton = document.getElementById('scanButton');
const sendButton = document.getElementById('sendButton');
const fillButton = document.getElementById('fillButton');
const clearButton = document.getElementById('clearButton');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const jobDetailsSection = document.getElementById('jobDetailsSection');
const companyInput = document.getElementById('companyInput');
const roleInput = document.getElementById('roleInput');
const previewSection = document.getElementById('previewSection');
const previewCompany = document.getElementById('previewCompany');
const previewRole = document.getElementById('previewRole');
const previewFields = document.getElementById('previewFields');
const previewActions = document.getElementById('previewActions');

// Store scanned data and backend response
let scannedData = null;
let backendResponse = null;
let currentTabId = null;

// Backend API endpoint
const BACKEND_URL = 'http://localhost:5050/api/match-fields';

// Update preview when job details change
function updatePreview() {
  if (!scannedData) return;

  const { fields = [], actions = [] } = scannedData;

  previewCompany.textContent = companyInput.value || '-';
  previewRole.textContent = roleInput.value || '-';
  previewFields.textContent = fields.length;
  previewActions.textContent = actions.length;

  previewSection.classList.add('show');
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

    // Show sections
    jobDetailsSection.classList.add('show');
    updatePreview();
    sendButton.classList.add('show');

    // Show status
    statusDiv.textContent = `Loaded: ${fields.length} field${fields.length !== 1 ? 's' : ''}, ${actions.length} action${actions.length !== 1 ? 's' : ''}`;
    statusDiv.className = 'status';

    // Display full results
    resultsDiv.textContent = JSON.stringify(scannedData, null, 2);
    resultsDiv.classList.add('show');
  }

  // Restore backend response if exists
  if (backendResponse) {
    displayStructuredResponse(backendResponse);
    fillButton.classList.add('show');

    const readyCount = Object.keys(backendResponse.fill_values || {}).length;
    const filesCount = Object.keys(backendResponse.files || {}).length;
    const needsCount = (backendResponse.needs_human || []).length;
    statusDiv.textContent = `Loaded: ${readyCount} ready to fill, ${filesCount} files, ${needsCount} need input`;
    statusDiv.className = 'status success';
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
  jobDetailsSection.classList.remove('show');
  previewSection.classList.remove('show');
  sendButton.classList.remove('show');
  fillButton.classList.remove('show');
  resultsDiv.classList.remove('show');
  resultsDiv.textContent = '';
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

  resultsDiv.innerHTML = html;
  resultsDiv.classList.add('show');
}

// Handle scan button click
scanButton.addEventListener('click', async () => {
  try {
    // Disable button during scan
    scanButton.disabled = true;
    sendButton.classList.remove('show');
    fillButton.classList.remove('show');
    jobDetailsSection.classList.remove('show');
    previewSection.classList.remove('show');
    statusDiv.textContent = 'Scanning...';
    statusDiv.className = 'status';
    resultsDiv.classList.remove('show');
    resultsDiv.textContent = '';
    scannedData = null;
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

      statusDiv.textContent = `Found ${fields.length} field${fields.length !== 1 ? 's' : ''} and ${actions.length} action${actions.length !== 1 ? 's' : ''}`;
      statusDiv.className = 'status success';

      // Populate job details fields
      companyInput.value = jobDetails.company_name || '';
      roleInput.value = jobDetails.role_title || '';

      // Show job details section
      jobDetailsSection.classList.add('show');

      // Update preview
      updatePreview();

      // Format and display the full results
      resultsDiv.textContent = JSON.stringify(scanData, null, 2);
      resultsDiv.classList.add('show');

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

// Add event listeners to update preview when job details change
companyInput.addEventListener('input', updatePreview);
roleInput.addEventListener('input', updatePreview);

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
    // Disable button during send
    sendButton.disabled = true;
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
    // Re-enable button
    sendButton.disabled = false;
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
    // Disable button during fill
    fillButton.disabled = true;
    statusDiv.textContent = 'Filling form...';
    statusDiv.className = 'status';

    // TODO: Implement actual form filling logic
    // This will inject a content script that fills the form with backendResponse.fill_values

    console.log('Fill form with:', backendResponse);

    // Placeholder: Show success message
    statusDiv.textContent = 'Form filling not yet implemented';
    statusDiv.className = 'status';

  } catch (error) {
    console.error('Error filling form:', error);
    statusDiv.textContent = `Error: ${error.message}`;
    statusDiv.className = 'status error';
  } finally {
    // Re-enable button
    fillButton.disabled = false;
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
