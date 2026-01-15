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
    const elementId = element.id || element.name || 'unknown';

    // Helper function to add hint if not already present
    function addHint(text) {
      if (text && text.trim() && !hints.includes(text.trim())) {
        hints.push(text.trim());
      }
    }

    // 1. Check aria-describedby attribute (points to helper text element ID)
    const describedBy = element.getAttribute('aria-describedby');
    if (describedBy) {
      const hintElement = document.getElementById(describedBy);
      if (hintElement) {
        addHint(hintElement.innerText || hintElement.textContent);
        console.log('Field:', elementId, 'Found hint via aria-describedby:', hintElement.innerText || hintElement.textContent);
      }
    }

    // 2. Check element.nextElementSibling
    const nextSibling = element.nextElementSibling;
    if (nextSibling) {
      const text = nextSibling.innerText || nextSibling.textContent;
      if (text && text.trim().length > 0 && text.trim().length < 500) {
        // Reasonable length for hint
        addHint(text);
        console.log('Field:', elementId, 'Found hint in nextElementSibling:', text);
      }
    }

    // 3. Check parent element's nextElementSibling
    const parent = element.parentElement;
    if (parent && parent.nextElementSibling) {
      const text = parent.nextElementSibling.innerText || parent.nextElementSibling.textContent;
      if (text && text.trim().length > 0 && text.trim().length < 500) {
        addHint(text);
        console.log('Field:', elementId, 'Found hint in parent nextElementSibling:', text);
      }
    }

    // 4. Check for elements with id containing the input's id + "hint", "help", "desc"
    if (element.id) {
      const hintSuffixes = ['hint', 'help', 'desc', 'description', 'helper', 'note'];
      hintSuffixes.forEach(suffix => {
        const hintId = `${element.id}-${suffix}`;
        const hintElement = document.getElementById(hintId);
        if (hintElement) {
          addHint(hintElement.innerText || hintElement.textContent);
          console.log('Field:', elementId, 'Found hint via id pattern:', hintElement.innerText || hintElement.textContent);
        }

        // Also try without hyphen
        const hintIdNoDash = `${element.id}${suffix}`;
        const hintElementNoDash = document.getElementById(hintIdNoDash);
        if (hintElementNoDash) {
          addHint(hintElementNoDash.innerText || hintElementNoDash.textContent);
          console.log('Field:', elementId, 'Found hint via id pattern (no dash):', hintElementNoDash.innerText || hintElementNoDash.textContent);
        }
      });
    }

    // 5. Search within the input's closest div, fieldset, or label parent
    const container = element.closest('div, fieldset, label');
    if (container) {
      // Look for <small> tags
      const smallTags = container.querySelectorAll('small');
      smallTags.forEach(small => {
        if (!small.contains(element) && small !== element) {
          const text = small.innerText || small.textContent;
          if (text && text.trim().length > 0) {
            addHint(text);
            console.log('Field:', elementId, 'Found hint in <small> tag:', text);
          }
        }
      });

      // Look for elements with hint-related classes
      const hintKeywords = ['hint', 'help', 'description', 'helper', 'subscript', 'caption', 'note', 'sub'];
      hintKeywords.forEach(keyword => {
        const hintElements = container.querySelectorAll(`[class*="${keyword}" i]`);
        hintElements.forEach(hintEl => {
          if (!hintEl.contains(element) && hintEl !== element) {
            const text = hintEl.innerText || hintEl.textContent;
            if (text && text.trim().length > 0 && text.trim().length < 500) {
              addHint(text);
              console.log('Field:', elementId, `Found hint in .${keyword} class:`, text);
            }
          }
        });
      });
    }

    // Return combined hints or empty string
    const hintText = hints.length > 0 ? hints.join(' | ') : '';
    console.log('Field:', elementId, 'Final hint:', hintText);
    return hintText;
  }

  /**
   * Get the input type for better categorization
   */
  function getInputType(element) {
    if (element.tagName === 'SELECT') {
      return 'select';
    }
    if (element.tagName === 'TEXTAREA') {
      return 'textarea';
    }
    if (element.tagName === 'INPUT') {
      const inputType = element.type || 'text';
      if (inputType === 'file') return 'file';
      if (inputType === 'radio') return 'radio'; // Will be grouped later
      if (inputType === 'checkbox') return 'checkbox'; // Will be grouped later
      return 'text'; // text, email, tel, url, number, etc.
    }
    return 'text';
  }

  /**
   * Extract options from a select element
   */
  function extractSelectOptions(selectElement) {
    const options = [];
    const optionElements = selectElement.querySelectorAll('option');

    // Limit to first 20 options if too many
    const limit = Math.min(optionElements.length, 20);

    for (let i = 0; i < limit; i++) {
      const option = optionElements[i];
      options.push({
        value: option.value || '',
        text: option.textContent.trim()
      });
    }

    return options;
  }

  /**
   * Try to find options for Greenhouse/custom dropdown fields
   * Greenhouse often uses custom dropdowns that aren't standard <select> elements
   */
  function extractCustomDropdownOptions(element) {
    // Strategy 1: Look for a select element with matching name or ID
    if (element.name || element.id) {
      // Try finding by exact name match
      if (element.name) {
        const selectByName = document.querySelector(`select[name="${element.name}"]`);
        if (selectByName && selectByName !== element) {
          const opts = extractSelectOptions(selectByName);
          if (opts.length > 0) return opts;
        }
      }

      // Try finding by exact ID match (hidden select might have same ID with suffix)
      if (element.id) {
        const selectById = document.querySelector(`select[id="${element.id}"], select[id="${element.id}_select"], select[data-for="${element.id}"]`);
        if (selectById && selectById !== element) {
          const opts = extractSelectOptions(selectById);
          if (opts.length > 0) return opts;
        }
      }
    }

    // Strategy 2: Look for a hidden select element nearby (common pattern)
    const parent = element.parentElement;
    if (parent) {
      // Check for sibling select
      const siblingSelect = parent.querySelector('select');
      if (siblingSelect && siblingSelect !== element) {
        const opts = extractSelectOptions(siblingSelect);
        if (opts.length > 0) return opts;
      }

      // Check for select in parent's parent (nested wrapper)
      const grandparent = parent.parentElement;
      if (grandparent) {
        const selectInGrandparent = grandparent.querySelector('select');
        if (selectInGrandparent && selectInGrandparent !== element) {
          const opts = extractSelectOptions(selectInGrandparent);
          if (opts.length > 0) return opts;
        }
      }

      // Check great-grandparent too (deeply nested)
      const greatGrandparent = grandparent ? grandparent.parentElement : null;
      if (greatGrandparent) {
        const selectInGreatGrandparent = greatGrandparent.querySelector('select');
        if (selectInGreatGrandparent && selectInGreatGrandparent !== element) {
          const opts = extractSelectOptions(selectInGreatGrandparent);
          if (opts.length > 0) return opts;
        }
      }
    }

    // Strategy 3: Look for aria-controls (points to option list)
    const controlsId = element.getAttribute('aria-controls');
    if (controlsId) {
      const listbox = document.getElementById(controlsId);
      if (listbox) {
        const options = [];
        const optionElements = listbox.querySelectorAll('[role="option"], li, .option, .select-option');
        const limit = Math.min(optionElements.length, 20);

        for (let i = 0; i < limit; i++) {
          const opt = optionElements[i];
          const text = opt.textContent.trim();
          const value = opt.getAttribute('data-value') || opt.getAttribute('value') || text;
          if (text) {
            options.push({ value, text });
          }
        }

        if (options.length > 0) {
          return options;
        }
      }
    }

    // Strategy 4: Look for common Greenhouse dropdown patterns
    // Greenhouse often wraps fields in divs with classes like 'field', 'select-wrapper', etc.
    let container = element.closest('.field, .form-field, .select-wrapper, .custom-select, [data-field-type]');
    if (container) {
      // Look for option elements within the container
      const optionElements = container.querySelectorAll(
        '[role="option"], .option, .select-option, [data-option-value], li[data-value]'
      );

      if (optionElements.length > 0) {
        const options = [];
        const limit = Math.min(optionElements.length, 20);

        for (let i = 0; i < limit; i++) {
          const opt = optionElements[i];
          const text = opt.textContent.trim();
          const value = opt.getAttribute('data-value') ||
                       opt.getAttribute('data-option-value') ||
                       opt.getAttribute('value') ||
                       text;
          if (text && text !== '') {
            options.push({ value, text });
          }
        }

        if (options.length > 0) {
          return options;
        }
      }
    }

    // Strategy 5: Heuristic fallback - infer Yes/No options for likely boolean questions
    // This handles cases where Greenhouse loads options dynamically
    const label = getFieldLabel(element).toLowerCase();
    const hint = getFieldHint(element).toLowerCase();
    const combinedText = `${label} ${hint}`;

    // Check if this looks like a yes/no question
    const yesNoPatterns = [
      /\b(are you|do you|did you|have you|will you|would you|can you|is )\b/i,
      /\b(open to|willing to|require|need)\b/i,
      /\?(.*)?$/  // Ends with question mark
    ];

    const looksLikeBooleanQuestion = yesNoPatterns.some(pattern => pattern.test(combinedText));

    // Check for specific keywords that strongly suggest yes/no
    const strongBooleanKeywords = [
      'sponsorship', 'visa', 'relocation', 'relocate', 'open to',
      'willing to', 'interviewed', 'worked at', 'clearance'
    ];
    const hasStrongKeyword = strongBooleanKeywords.some(keyword => combinedText.includes(keyword));

    // Check for acknowledgment/consent patterns (like "AI Policy", "Terms", etc.)
    const acknowledgmentPatterns = [
      /\b(policy|policies|guideline|guidelines|terms|agreement)\b/i,
      /\b(confirm|acknowledge|agree|consent|accept|understand|reviewed?|read)\b/i,
      /\b(select|selecting|choose|click)\s+(yes|no)/i,  // Hint mentions selecting yes/no
      /yes\b.*\bno\b|no\b.*\byes\b/i  // Hint mentions both "yes" and "no"
    ];
    const looksLikeAcknowledgment = acknowledgmentPatterns.some(pattern => pattern.test(combinedText));

    if (looksLikeBooleanQuestion || hasStrongKeyword || looksLikeAcknowledgment) {
      console.log(`Inferring Yes/No options for field: ${element.id || element.name} (label: "${label}")`);
      return [
        { value: 'Yes', text: 'Yes' },
        { value: 'No', text: 'No' }
      ];
    }

    return null;
  }

  /**
   * Extract information from a form field
   */
  function extractFieldInfo(element, options = null) {
    const fieldInfo = {
      label: getFieldLabel(element),
      hint: getFieldHint(element),
      type: getFieldType(element),
      input_type: getInputType(element),
      name: element.name || '',
      id: element.id || '',
      required: isFieldRequired(element),
      value: getFieldValue(element),
      placeholder: element.placeholder || '',
      autocomplete: element.getAttribute('autocomplete') || ''
    };

    // Add options for select elements
    if (element.tagName === 'SELECT') {
      fieldInfo.options = extractSelectOptions(element);
    }
    // Try to detect custom dropdown options for text inputs (e.g., Greenhouse)
    else if (element.tagName === 'INPUT' && (element.type === 'text' || !element.type)) {
      const customOptions = extractCustomDropdownOptions(element);
      if (customOptions && customOptions.length > 0) {
        console.log(`Found custom dropdown options for ${element.id || element.name}:`, customOptions);
        fieldInfo.options = customOptions;
        fieldInfo.input_type = 'custom_select';  // Mark as custom select for backend
      }
    }

    // Add options for radio/checkbox groups (passed from scanFormFields)
    if (options) {
      fieldInfo.options = options;
    }

    return fieldInfo;
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
   * Get label text for a radio/checkbox option
   */
  function getOptionLabel(element) {
    // For radio/checkbox, try to get the specific label for this option
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label && label.textContent.trim()) {
        return label.textContent.trim();
      }
    }

    // Try parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      // Clone the label and remove the input element to get just the text
      const clone = parentLabel.cloneNode(true);
      const inputs = clone.querySelectorAll('input');
      inputs.forEach(input => input.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }

    // Try next sibling text node
    let sibling = element.nextSibling;
    while (sibling) {
      if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
        return sibling.textContent.trim();
      }
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.textContent.trim()) {
        return sibling.textContent.trim();
      }
      sibling = sibling.nextSibling;
    }

    return element.value || '[No label]';
  }

  /**
   * Find all form fields on the page
   */
  function scanFormFields() {
    // Find all input, select, and textarea elements
    const inputs = document.querySelectorAll('input, select, textarea');
    const formFields = [];
    const radioGroups = new Map(); // name -> [elements]
    const checkboxGroups = new Map(); // name -> [elements]
    const processedNames = new Set(); // Track processed group names

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

      // Group radio buttons by name
      if (element.type === 'radio' && element.name) {
        if (!radioGroups.has(element.name)) {
          radioGroups.set(element.name, []);
        }
        radioGroups.get(element.name).push(element);
        return; // Don't process individually
      }

      // Group checkboxes by name (if multiple with same name exist)
      if (element.type === 'checkbox' && element.name) {
        if (!checkboxGroups.has(element.name)) {
          checkboxGroups.set(element.name, []);
        }
        checkboxGroups.get(element.name).push(element);
        return; // Don't process individually for now
      }

      // Process all other elements normally
      try {
        const fieldInfo = extractFieldInfo(element);
        formFields.push(fieldInfo);
      } catch (error) {
        console.error('Error extracting field info:', error, element);
      }
    });

    // Process radio button groups
    radioGroups.forEach((elements, name) => {
      if (elements.length === 0) return;

      try {
        // Use the first element as the base for the field info
        const firstElement = elements[0];
        const fieldInfo = extractFieldInfo(firstElement);

        // Override input_type to indicate it's a group
        fieldInfo.input_type = 'radio_group';

        // Extract options from all radio buttons in the group
        fieldInfo.options = elements.map(el => ({
          value: el.value || '',
          text: getOptionLabel(el),
          checked: el.checked
        }));

        // Get the group label (usually from fieldset legend or common label)
        const fieldset = firstElement.closest('fieldset');
        if (fieldset) {
          const legend = fieldset.querySelector('legend');
          if (legend && legend.textContent.trim()) {
            fieldInfo.label = legend.textContent.trim();
          }
        }

        formFields.push(fieldInfo);
      } catch (error) {
        console.error('Error extracting radio group info:', error, name);
      }
    });

    // Process checkbox groups (only if multiple checkboxes share the same name)
    checkboxGroups.forEach((elements, name) => {
      if (elements.length === 0) return;

      try {
        // If only one checkbox with this name, treat it as individual
        if (elements.length === 1) {
          const fieldInfo = extractFieldInfo(elements[0]);
          formFields.push(fieldInfo);
          return;
        }

        // Multiple checkboxes with same name - treat as group
        const firstElement = elements[0];
        const fieldInfo = extractFieldInfo(firstElement);

        // Override input_type to indicate it's a group
        fieldInfo.input_type = 'checkbox_group';

        // Extract options from all checkboxes in the group
        fieldInfo.options = elements.map(el => ({
          value: el.value || '',
          text: getOptionLabel(el),
          checked: el.checked
        }));

        // Get the group label (usually from fieldset legend or common label)
        const fieldset = firstElement.closest('fieldset');
        if (fieldset) {
          const legend = fieldset.querySelector('legend');
          if (legend && legend.textContent.trim()) {
            fieldInfo.label = legend.textContent.trim();
          }
        }

        formFields.push(fieldInfo);
      } catch (error) {
        console.error('Error extracting checkbox group info:', error, name);
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
    // Try common ATS URL patterns first (fast and reliable)
    const url = window.location.href;

    // Greenhouse: boards.greenhouse.io/company_name/jobs/...
    if (url.includes('greenhouse.io')) {
      const match = url.match(/greenhouse\.io\/([^\/]+)/);
      if (match && match[1]) {
        const slug = match[1];
        result.company_name = slug.charAt(0).toUpperCase() + slug.slice(1);
      }
    }

    // Lever: jobs.lever.co/company_name/...
    if (!result.company_name && url.includes('lever.co')) {
      const match = url.match(/lever\.co\/([^\/]+)/);
      if (match && match[1]) {
        const slug = match[1];
        result.company_name = slug.charAt(0).toUpperCase() + slug.slice(1);
      }
    }

    // Try JSON-LD structured data (common across many sites)
    if (!result.company_name) {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.hiringOrganization && data.hiringOrganization.name) {
            result.company_name = data.hiringOrganization.name.trim();
            break;
          }
          if (data.author && data.author.name) {
            result.company_name = data.author.name.trim();
            break;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    // Try multiple meta tags
    if (!result.company_name) {
      const metaTags = [
        'meta[property="og:site_name"]',
        'meta[name="author"]',
        'meta[name="company"]',
        'meta[property="og:author"]',
        'meta[name="application-name"]'
      ];

      for (const selector of metaTags) {
        const meta = document.querySelector(selector);
        if (meta && meta.content && meta.content.trim().length > 0) {
          const content = meta.content.trim();
          // Skip generic or too long values
          if (content.length < 50 && !content.includes('http') && !content.toLowerCase().includes('jobs')) {
            result.company_name = content;
            break;
          }
        }
      }
    }

    // Try common DOM selectors used by various ATS platforms
    if (!result.company_name) {
      const selectors = [
        '.company-name',
        '.employer-name',
        '[data-company-name]',
        '[class*="company" i]:not(button):not(a)',
        '[class*="employer" i]:not(button):not(a)',
        '.job-company',
        '.posting-company'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent.trim();
          // Skip if too long (likely contains more than just company name)
          if (text.length > 0 && text.length < 50 && !text.includes('\n')) {
            result.company_name = text;
            break;
          }
        }
      }
    }

    // Try page title with better parsing
    if (!result.company_name && document.title) {
      const title = document.title.trim();

      // Common patterns: "Job Title - Company" or "Job Title | Company" or "Job Title at Company"
      const patterns = [
        /\sat\s+([^-|]+)$/i,           // "... at Company"
        /[-|]\s*([^-|]+)\s*$/,          // "... - Company" or "... | Company" (last part)
        /^([^-|]+)\s*[-|]/              // "Company - ..." or "Company | ..." (first part if short)
      ];

      for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim();
          // Only accept if it looks like a company name (short, not containing job-related words)
          if (candidate.length > 0 && candidate.length < 50 &&
              !candidate.toLowerCase().includes('job') &&
              !candidate.toLowerCase().includes('career') &&
              !candidate.toLowerCase().includes('apply')) {
            result.company_name = candidate;
            break;
          }
        }
      }
    }

    // Try data attributes
    if (!result.company_name) {
      const dataElement = document.querySelector('[data-company], [data-employer], [data-organization]');
      if (dataElement) {
        const dataCompany = dataElement.getAttribute('data-company') ||
                           dataElement.getAttribute('data-employer') ||
                           dataElement.getAttribute('data-organization');
        if (dataCompany && dataCompany.trim().length > 0) {
          result.company_name = dataCompany.trim();
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

  /**
   * Fuzzy match a value against option values/text
   * Handles case-insensitivity, boolean equivalents, and common variations
   */
  function fuzzyMatchOption(value, optionValue, optionText) {
    // Convert to strings for comparison
    const val = String(value).toLowerCase().trim();
    const optVal = String(optionValue).toLowerCase().trim();
    const optTxt = String(optionText).toLowerCase().trim();

    // Exact match (case-insensitive)
    if (val === optVal || val === optTxt) {
      return true;
    }

    // Boolean equivalents
    const trueValues = ['true', 'yes', '1', 't', 'y'];
    const falseValues = ['false', 'no', '0', 'f', 'n'];

    if (trueValues.includes(val)) {
      return trueValues.includes(optVal) || trueValues.includes(optTxt);
    }

    if (falseValues.includes(val)) {
      return falseValues.includes(optVal) || falseValues.includes(optTxt);
    }

    // Country variations
    const countryVariations = {
      'united states': ['us', 'usa', 'u.s.', 'u.s.a.', 'united states of america'],
      'united kingdom': ['uk', 'u.k.', 'great britain', 'gb'],
      'canada': ['ca', 'can'],
      // Add more as needed
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

  /**
   * Fill form fields with provided values
   * NOTE: Currently not used directly - the fill logic is injected from popup.js
   * This function is kept here for reference and potential future use
   * @param {Object} fillValues - Object mapping field IDs/names to values
   * @returns {Object} - Summary of filled fields and errors
   */
  function fillFormFields(fillValues) {
    console.log('Filling form fields with values:', fillValues);

    const results = {
      filled: [],
      errors: [],
      notFound: []
    };

    for (const [fieldIdentifier, value] of Object.entries(fillValues)) {
      try {
        // Try to find the element by ID first, then by name
        let element = document.getElementById(fieldIdentifier);
        if (!element) {
          element = document.querySelector(`[name="${fieldIdentifier}"]`);
        }

        // If still not found, try array index
        if (!element && /^\d+$/.test(fieldIdentifier)) {
          const inputs = document.querySelectorAll('input, select, textarea');
          element = inputs[parseInt(fieldIdentifier)];
        }

        if (!element) {
          console.warn(`Field not found: ${fieldIdentifier}`);
          results.notFound.push(fieldIdentifier);
          continue;
        }

        // Handle different field types
        const fieldType = getFieldType(element);

        if (fieldType === 'checkbox') {
          // Handle checkbox fields - use fuzzy matching for boolean values
          const val = String(value).toLowerCase().trim();
          const trueValues = ['true', 'yes', '1', 't', 'y'];
          const falseValues = ['false', 'no', '0', 'f', 'n'];

          if (value === true || trueValues.includes(val)) {
            element.checked = true;

            // Dispatch events to trigger any listeners
            element.dispatchEvent(new Event('click', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));

            console.log(`Checked checkbox: ${fieldIdentifier}`);
            results.filled.push({ field: fieldIdentifier, type: 'checkbox', value: true });
          } else if (value === false || falseValues.includes(val)) {
            element.checked = false;

            element.dispatchEvent(new Event('click', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));

            console.log(`Unchecked checkbox: ${fieldIdentifier}`);
            results.filled.push({ field: fieldIdentifier, type: 'checkbox', value: false });
          }
        } else if (fieldType === 'radio') {
          // Handle radio buttons - use fuzzy matching for boolean values
          const val = String(value).toLowerCase().trim();
          const trueValues = ['true', 'yes', '1', 't', 'y'];

          if (value === true || trueValues.includes(val)) {
            element.checked = true;

            element.dispatchEvent(new Event('click', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));

            console.log(`Selected radio: ${fieldIdentifier}`);
            results.filled.push({ field: fieldIdentifier, type: 'radio', value: true });
          }
        } else if (fieldType === 'select') {
          // Handle select dropdowns with fuzzy matching
          // Try exact match first
          let option = Array.from(element.options).find(opt =>
            opt.value === String(value) || opt.text === String(value)
          );

          // If no exact match, try fuzzy matching
          if (!option) {
            option = Array.from(element.options).find(opt =>
              fuzzyMatchOption(value, opt.value, opt.text)
            );
          }

          if (option) {
            element.value = option.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));

            console.log(`Set select: ${fieldIdentifier} = ${option.text} (matched from: ${value})`);
            results.filled.push({ field: fieldIdentifier, type: 'select', value: option.text });
          } else {
            console.warn(`Option not found in select ${fieldIdentifier}:`, value);
            console.warn(`Available options:`, Array.from(element.options).map(o => `"${o.value}" / "${o.text}"`));
            results.errors.push({ field: fieldIdentifier, error: 'Option not found' });
          }
        } else {
          // Handle text inputs, textareas, etc.
          element.value = String(value);

          // Dispatch input and change events
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));

          console.log(`Set field: ${fieldIdentifier} = ${value}`);
          results.filled.push({ field: fieldIdentifier, type: fieldType, value: value });
        }

      } catch (error) {
        console.error(`Error filling field ${fieldIdentifier}:`, error);
        results.errors.push({ field: fieldIdentifier, error: error.message });
      }
    }

    console.log('Fill results:', results);
    return results;
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
