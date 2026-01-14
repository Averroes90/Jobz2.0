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
   * Check if element is visible
   */
  function isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  /**
   * Get text content for button/link
   */
  function getElementText(element) {
    // Get direct text content, trimmed
    let text = element.textContent.trim();

    // For buttons with no text, try aria-label or value
    if (!text && element.getAttribute('aria-label')) {
      text = element.getAttribute('aria-label').trim();
    }
    if (!text && element.value) {
      text = element.value.trim();
    }

    return text || '[No text]';
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
      if (!isVisible(element)) {
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

  /**
   * Find all action elements (buttons, submit inputs, links)
   */
  function scanActions() {
    const actions = [];

    // 1. Find all <button> elements
    const buttons = document.querySelectorAll('button');
    buttons.forEach((button) => {
      if (!isVisible(button)) return;

      try {
        actions.push({
          type: 'button',
          text: getElementText(button),
          buttonType: button.type || 'button',
          id: button.id || '',
          class: button.className || '',
          href: ''
        });
      } catch (error) {
        console.error('Error extracting button info:', error, button);
      }
    });

    // 2. Find <input type="submit"> and <input type="button">
    const inputButtons = document.querySelectorAll('input[type="submit"], input[type="button"]');
    inputButtons.forEach((input) => {
      if (!isVisible(input)) return;

      try {
        actions.push({
          type: 'input-button',
          text: input.value || getElementText(input),
          buttonType: input.type,
          id: input.id || '',
          class: input.className || '',
          href: ''
        });
      } catch (error) {
        console.error('Error extracting input button info:', error, input);
      }
    });

    // 3. Find elements with role="button"
    const roleButtons = document.querySelectorAll('[role="button"]');
    roleButtons.forEach((element) => {
      if (!isVisible(element)) return;
      // Skip if already captured as a <button> element
      if (element.tagName === 'BUTTON') return;

      try {
        actions.push({
          type: 'role-button',
          text: getElementText(element),
          buttonType: '',
          id: element.id || '',
          class: element.className || '',
          href: ''
        });
      } catch (error) {
        console.error('Error extracting role button info:', error, element);
      }
    });

    // 4. Find links with keywords: "apply", "upload", "submit", "linkedin"
    const links = document.querySelectorAll('a');
    const keywords = ['apply', 'upload', 'submit', 'linkedin'];

    links.forEach((link) => {
      if (!isVisible(link)) return;

      const text = getElementText(link).toLowerCase();
      const href = (link.href || '').toLowerCase();

      // Check if text or href contains any of the keywords
      const hasKeyword = keywords.some(keyword =>
        text.includes(keyword) || href.includes(keyword)
      );

      if (hasKeyword) {
        try {
          actions.push({
            type: 'link',
            text: getElementText(link),
            buttonType: '',
            id: link.id || '',
            class: link.className || '',
            href: link.href || ''
          });
        } catch (error) {
          console.error('Error extracting link info:', error, link);
        }
      }
    });

    return actions;
  }

  // Execute the scan and return results
  const fields = scanFormFields();
  const actions = scanActions();

  console.log(`Found ${fields.length} form fields and ${actions.length} actions`);
  console.log('Fields:', fields);
  console.log('Actions:', actions);

  // Return the results (this will be received by popup.js)
  return {
    fields: fields,
    actions: actions
  };
})();
