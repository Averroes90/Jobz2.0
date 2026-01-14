/**
 * Example: How to fetch token usage from the backend API
 *
 * This can be added to popup.js or called from the extension
 * to display token usage statistics to the user.
 */

const BACKEND_URL = 'http://localhost:5050';

/**
 * Fetch current session token usage from the backend
 */
async function getTokenUsage() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/token-usage`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching token usage:', error);
    return null;
  }
}

/**
 * Display token usage in the console
 */
async function displayTokenUsage() {
  const usage = await getTokenUsage();

  if (!usage) {
    console.log('Could not fetch token usage');
    return;
  }

  console.log('=== Token Usage Summary ===');
  console.log(`Total calls: ${usage.session_total.call_count}`);
  console.log(`Total tokens: ${usage.session_total.total_tokens.toLocaleString()}`);
  console.log(`Total cost: $${usage.session_total.total_cost.toFixed(4)}`);

  console.log('\nBy task:');
  usage.by_task.forEach(task => {
    console.log(`  ${task.task_name} (${task.model}):`);
    console.log(`    Calls: ${task.call_count}`);
    console.log(`    Tokens: ${task.total_tokens.toLocaleString()}`);
    console.log(`    Cost: $${task.cost_estimate.toFixed(4)}`);
  });
}

/**
 * Display token usage in a DOM element
 */
async function displayTokenUsageInUI(elementId) {
  const usage = await getTokenUsage();
  const element = document.getElementById(elementId);

  if (!usage || !element) return;

  const total = usage.session_total;

  element.innerHTML = `
    <div class="token-usage">
      <h3>Session Token Usage</h3>
      <div class="usage-summary">
        <div><strong>Calls:</strong> ${total.call_count}</div>
        <div><strong>Tokens:</strong> ${total.total_tokens.toLocaleString()}</div>
        <div><strong>Cost:</strong> $${total.total_cost.toFixed(4)}</div>
      </div>
      <details>
        <summary>View by task</summary>
        <ul>
          ${usage.by_task.map(task => `
            <li>
              <strong>${task.task_name}</strong> (${task.model}):
              ${task.call_count} calls,
              ${task.total_tokens.toLocaleString()} tokens,
              $${task.cost_estimate.toFixed(4)}
            </li>
          `).join('')}
        </ul>
      </details>
    </div>
  `;
}

// Example usage:
// displayTokenUsage();
// displayTokenUsageInUI('token-usage-container');
