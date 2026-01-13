// Get DOM elements
const scanButton = document.getElementById('scanButton');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');

// Handle scan button click
scanButton.addEventListener('click', async () => {
  try {
    // Disable button during scan
    scanButton.disabled = true;
    statusDiv.textContent = 'Scanning...';
    statusDiv.className = 'status';
    resultsDiv.classList.remove('show');
    resultsDiv.textContent = '';

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

    // The content script returns the form fields data
    const formFields = results[0]?.result;

    if (!formFields) {
      throw new Error('No data returned from content script');
    }

    // Display results
    if (formFields.length === 0) {
      statusDiv.textContent = 'No form fields found on this page';
      statusDiv.className = 'status';
    } else {
      statusDiv.textContent = `Found ${formFields.length} form field${formFields.length !== 1 ? 's' : ''}`;
      statusDiv.className = 'status success';

      // Format and display the results
      resultsDiv.textContent = JSON.stringify(formFields, null, 2);
      resultsDiv.classList.add('show');
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

// Log when popup loads
console.log('Form scanner popup loaded');
