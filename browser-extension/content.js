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
   * Get hint/help text for a form field
   * Checks multiple sources: aria-describedby, adjacent help elements, container hints
   */
  function getFieldHint(element) {
    const hints = [];

    // 1. Check aria-describedby attribute (points to helper text element ID)
    const describedBy = element.getAttribute('aria-describedby');
    if (describedBy) {
      const hintElement = document.getElementById(describedBy);
      if (hintElement && hintElement.textContent.trim()) {
        hints.push(hintElement.textContent.trim());
      }
    }

    // 2. Find the field's container (form group, field wrapper, etc.)
    const container = element.closest('[class*="field" i], [class*="form-group" i], [class*="input-group" i], div');
    if (container) {
      // Look for hint/help elements within the container
      const hintSelectors = [
        '[class*="hint" i]',
        '[class*="help" i]',
        '[class*="description" i]',
        '[class*="subscript" i]',
        '[class*="subtitle" i]',
        '[class*="helper" i]',
        'small',
        '.help-text',
        '.field-hint'
      ];

      hintSelectors.forEach(selector => {
        const hintElements = container.querySelectorAll(selector);
        hintElements.forEach(hintEl => {
          // Only include if it's not the field itself and not the label
          if (hintEl !== element && !hintEl.contains(element)) {
            const text = hintEl.textContent.trim();
            if (text && !hints.includes(text)) {
              hints.push(text);
            }
          }
        });
      });
    }

    // 3. Check for elements immediately following the field
    let nextSibling = element.nextElementSibling;
    if (nextSibling) {
      // Check if it's a hint element
      const isHintElement =
        nextSibling.tagName === 'SMALL' ||
        nextSibling.classList.toString().toLowerCase().match(/hint|help|description|subscript|subtitle/) ||
        (nextSibling.tagName === 'SPAN' && nextSibling.classList.toString().toLowerCase().includes('help')) ||
        nextSibling.tagName === 'P';

      if (isHintElement) {
        const text = nextSibling.textContent.trim();
        if (text && !hints.includes(text)) {
          hints.push(text);
        }
      }
    }

    // 4. Check for elements immediately following the label
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) {
      nextSibling = label.nextElementSibling;
      if (nextSibling && nextSibling !== element) {
        const isHintElement =
          nextSibling.tagName === 'SMALL' ||
          nextSibling.classList.toString().toLowerCase().match(/hint|help|description|subscript|subtitle/) ||
          (nextSibling.tagName === 'SPAN' && nextSibling.classList.toString().toLowerCase().includes('help')) ||
          nextSibling.tagName === 'P';

        if (isHintElement) {
          const text = nextSibling.textContent.trim();
          if (text && !hints.includes(text)) {
            hints.push(text);
          }
        }
      }
    }

    // Return combined hints or empty string
    return hints.length > 0 ? hints.join(' | ') : '';
  }

  /**
   * Extract information from a form field
   */
  function extractFieldInfo(element) {
    return {
      label: getFieldLabel(element),
      hint: getFieldHint(element),
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
   * Extract job details from the page
   * Returns {company_name, role_title, job_description}
   */
  function extractJobDetails() {
    const result = {
      company_name: '',
      role_title: '',
      job_description: ''
    };

    // --- Extract Company Name ---
    // Try og:site_name meta tag
    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    if (ogSiteName && ogSiteName.content) {
      result.company_name = ogSiteName.content.trim();
    }

    // Try page title (extract company before " - " or " | ")
    if (!result.company_name && document.title) {
      const titleParts = document.title.split(/\s+[-|]\s+/);
      if (titleParts.length > 1) {
        // Often the last part is the company name
        result.company_name = titleParts[titleParts.length - 1].trim();
      }
    }

    // Try element with class containing "company"
    if (!result.company_name) {
      const companyElement = document.querySelector('[class*="company" i], [class*="employer" i]');
      if (companyElement && companyElement.textContent) {
        result.company_name = companyElement.textContent.trim();
      }
    }

    // Try header elements with company info
    if (!result.company_name) {
      const headers = document.querySelectorAll('header h1, header h2, header span, header div');
      for (const header of headers) {
        const text = header.textContent.trim();
        // Look for shorter text that might be company name (not long job descriptions)
        if (text.length > 0 && text.length < 100 && !text.includes('\n')) {
          result.company_name = text;
          break;
        }
      }
    }

    // --- Extract Role Title ---
    // Try og:title meta tag
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      result.role_title = ogTitle.content.trim();
    }

    // Try <h1> element
    if (!result.role_title) {
      const h1 = document.querySelector('h1');
      if (h1 && h1.textContent) {
        result.role_title = h1.textContent.trim();
      }
    }

    // Try element with class containing "title", "position", "job-title", "role"
    if (!result.role_title) {
      const titleElement = document.querySelector(
        '[class*="job-title" i], [class*="jobtitle" i], [class*="position" i], [class*="role" i], [class*="job_title" i]'
      );
      if (titleElement && titleElement.textContent) {
        result.role_title = titleElement.textContent.trim();
      }
    }

    // Try page title (extract job title before " - " or " | ")
    if (!result.role_title && document.title) {
      const titleParts = document.title.split(/\s+[-|]\s+/);
      if (titleParts.length > 0) {
        // Often the first part is the job title
        result.role_title = titleParts[0].trim();
      }
    }

    // --- Extract Job Description ---
    // Try main content area
    const mainElement = document.querySelector('main, [role="main"]');
    if (mainElement) {
      result.job_description = mainElement.textContent.trim();
    }

    // Try element with class containing "description" or "content"
    if (!result.job_description) {
      const descElement = document.querySelector(
        '[class*="description" i], [class*="job-description" i], [class*="job_description" i], [class*="content" i]'
      );
      if (descElement && descElement.textContent) {
        result.job_description = descElement.textContent.trim();
      }
    }

    // Try <article> tags
    if (!result.job_description) {
      const article = document.querySelector('article');
      if (article && article.textContent) {
        result.job_description = article.textContent.trim();
      }
    }

    // Clean up extracted text (remove extra whitespace)
    result.company_name = result.company_name.replace(/\s+/g, ' ').trim();
    result.role_title = result.role_title.replace(/\s+/g, ' ').trim();
    result.job_description = result.job_description.replace(/\s+/g, ' ').trim();

    // Truncate job description if too long (keep first 5000 chars)
    if (result.job_description.length > 5000) {
      result.job_description = result.job_description.substring(0, 5000) + '...';
    }

    return result;
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
  const jobDetails = extractJobDetails();

  console.log(`Found ${fields.length} form fields and ${actions.length} actions`);
  console.log('Fields:', fields);
  console.log('Actions:', actions);
  console.log('Job Details:', jobDetails);

  // Return the results (this will be received by popup.js)
  return {
    fields: fields,
    actions: actions,
    jobDetails: jobDetails
  };
})();
