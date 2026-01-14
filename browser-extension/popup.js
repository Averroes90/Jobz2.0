// Get DOM elements
const scanButton = document.getElementById('scanButton');
const sendButton = document.getElementById('sendButton');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');

// Store scanned data
let scannedData = null;

// Backend API endpoint
const BACKEND_URL = 'http://localhost:5000/api/match-fields';

// Handle scan button click
scanButton.addEventListener('click', async () => {
  try {
    // Disable button during scan
    scanButton.disabled = true;
    sendButton.classList.remove('show');
    statusDiv.textContent = 'Scanning...';
    statusDiv.className = 'status';
    resultsDiv.classList.remove('show');
    resultsDiv.textContent = '';
    scannedData = null;

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.id) {
      throw new Error('No active tab found');
    }

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

    const { fields = [], actions = [] } = scanData;
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

      // Format and display the results
      resultsDiv.textContent = JSON.stringify(scanData, null, 2);
      resultsDiv.classList.add('show');

      // Show the send button
      sendButton.classList.add('show');
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

    // Send POST request to backend
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scannedData)
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const responseData = await response.json();

    // Display success message
    statusDiv.textContent = `Backend response: ${responseData.message || 'Success'}`;
    statusDiv.className = 'status success';

    // Display the response data
    resultsDiv.textContent = JSON.stringify(responseData, null, 2);
    resultsDiv.classList.add('show');

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

// Log when popup loads
console.log('Form scanner popup loaded');
