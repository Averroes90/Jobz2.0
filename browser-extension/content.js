// Content script to scan form fields on the page
(function() {
  console.log('Form scanner content script running');

  /**
   * Get label text for a form field
   * Checks multiple sources: associated label, aria-label, placeholder
   */
  function getFieldLabel(element) {
    // Try associated <label> element via for/id
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label && label.textContent.trim()) {
        return label.textContent.trim();
      }
    }

    // Try parent label (field nested inside label)
    const parentLabel = element.closest('label');
    if (parentLabel && parentLabel.textContent.trim()) {
      // Remove the element's own value from the label text
      let labelText = parentLabel.textContent.trim();
      if (element.value) {
        labelText = labelText.replace(element.value, '').trim();
      }
      return labelText;
    }

    // Try aria-label attribute
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label').trim();
    }

    // Try aria-labelledby
    if (element.getAttribute('aria-labelledby')) {
      const labelId = element.getAttribute('aria-labelledby');
      const labelElement = document.getElementById(labelId);
      if (labelElement && labelElement.textContent.trim()) {
        return labelElement.textContent.trim();
      }
    }

    // Try placeholder as last resort
    if (element.placeholder) {
      return `[Placeholder: ${element.placeholder}]`;
    }

    // Try name attribute
    if (element.name) {
      return `[Name: ${element.name}]`;
    }

    return '[No label]';
  }

  /**
   * Get the field type
   */
  function getFieldType(element) {
    if (element.tagName === 'SELECT') {
      return 'select';
    }
    if (element.tagName === 'TEXTAREA') {
      return 'textarea';
    }
    if (element.tagName === 'INPUT') {
      return element.type || 'text';
    }
    return 'unknown';
  }

  /**
   * Get the current value of the field
   */
  function getFieldValue(element) {
    if (element.tagName === 'SELECT') {
      const selectedOption = element.options[element.selectedIndex];
      return selectedOption ? selectedOption.text : '';
    }
    if (element.type === 'checkbox' || element.type === 'radio') {
      return element.checked ? 'checked' : 'unchecked';
    }
    return element.value || '';
  }

  /**
   * Check if field is required
   */
  function isFieldRequired(element) {
    // Check required attribute
    if (element.required || element.hasAttribute('required')) {
      return true;
    }

    // Check aria-required
    if (element.getAttribute('aria-required') === 'true') {
      return true;
    }

    // Check for visual indicators in label (*, "required", etc.)
    const label = getFieldLabel(element);
    if (label.includes('*') || label.toLowerCase().includes('required')) {
      return true;
    }

    return false;
  }

  /**
   * Extract information from a form field
   */
  function extractFieldInfo(element) {
    return {
      label: getFieldLabel(element),
      type: getFieldType(element),
      name: element.name || '',
      id: element.id || '',
      required: isFieldRequired(element),
      value: getFieldValue(element),
      placeholder: element.placeholder || '',
      autocomplete: element.getAttribute('autocomplete') || ''
    };
  }

  /**
   * Find all form fields on the page
   */
  function scanFormFields() {
    // Find all input, select, and textarea elements
    const inputs = document.querySelectorAll('input, select, textarea');
    const formFields = [];

    inputs.forEach((element) => {
      // Skip hidden inputs and buttons
      if (element.type === 'hidden' ||
          element.type === 'submit' ||
          element.type === 'button' ||
          element.type === 'image' ||
          element.type === 'reset') {
        return;
      }

      // Skip if element is not visible
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return;
      }

      try {
        const fieldInfo = extractFieldInfo(element);
        formFields.push(fieldInfo);
      } catch (error) {
        console.error('Error extracting field info:', error, element);
      }
    });

    return formFields;
  }

  // Execute the scan and return results
  const results = scanFormFields();
  console.log(`Found ${results.length} form fields:`, results);

  // Return the results (this will be received by popup.js)
  return results;
})();
