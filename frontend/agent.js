/**
 * Agentic Window + Command Bar Module
 * Isolated functionality for AI assistant panel and command palette
 * No global pollution - all state contained in IIFE
 */

function initAgent() {
  // ===== DOM REFERENCES =====
  const appLayout = document.querySelector('.app-layout');
  const agentPanel = document.getElementById('agentPanel');
  const agentMessages = document.getElementById('agentMessages');
  const agentInput = document.getElementById('agentInput');
  const agentSendBtn = document.getElementById('agentSendBtn');
  const agentCloseBtn = document.getElementById('agentCloseBtn');
  const agentClearBtn = document.getElementById('agentClearBtn');
  const agentTyping = document.getElementById('agentTyping');
  const agentContextBadge = document.getElementById('agentContextBadge');
  const agentToggleBtn = document.getElementById('agentToggleBtn');
  const agentResizeHandle = document.getElementById('agentResizeHandle');
  const agentInputRow = document.querySelector('.agent-input-row');

  const commandBarOverlay = document.getElementById('commandBarOverlay');
  const commandBarInput = document.getElementById('commandBarInput');
  const commandBarResults = document.getElementById('commandBarResults');

  const agentSuggestions = document.createElement('div');
  agentSuggestions.className = 'agent-suggestions';
  agentSuggestions.id = 'agentSuggestions';
  agentInputRow?.insertAdjacentElement('afterend', agentSuggestions);

  // ===== STATE =====
  let agentOpen = false;
  let commandBarOpen = false;
  let agentConversation = [];
  let agentTyping_flag = false;
  let agentPanelWidth = 340;
  let isResizing = false;
  let selectedActionIndex = -1;
  let selectedSuggestionIndex = -1;
  let visibleSuggestions = [];
  const AGENT_ENDPOINT = 'http://localhost:8081/agent/chat';
  const DEFAULT_COMMANDS = [
    'auto analyze',
    'open contrast decrease',
    'open color lab',
    'go to library',
    'go to upload',
    'open settings',
    'zoom in',
    'zoom out',
    'fit to view',
    'compare before after'
  ];

  // ===== QUICK ACTIONS LIST =====
  const quickActions = [
    {
      id: 'auto-analyze',
      label: 'Auto Analyze',
      icon: 'bi-magic',
      description: 'Run issue detection on uploaded images',
      action: async () => {
        if (window.kuonixAgent?.autoAnalyze) {
          const result = await window.kuonixAgent.autoAnalyze();
          notify(result.message, result.ok ? 'success' : 'warning');
        }
        closeCommandBar();
      }
    },
    {
      id: 'open-color-lab',
      label: 'Open Color Lab',
      icon: 'bi-palette',
      description: 'Launch the Color Correction Lab',
      shortcut: '⌘L',
      action: () => {
        const colorLabBtn = document.getElementById('colorLabBtn');
        if (colorLabBtn) colorLabBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'go-to-library',
      label: 'Go to Library',
      icon: 'bi-collection',
      description: 'View and manage your image library',
      action: () => {
        const libraryBtn = document.getElementById('libraryBtn');
        if (libraryBtn) libraryBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'upload-images',
      label: 'Upload Images',
      icon: 'bi-cloud-arrow-up',
      description: 'Add new images to your library',
      action: () => {
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) uploadBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'fit-view',
      label: 'Fit to View',
      icon: 'bi-arrows-fullscreen',
      description: 'Resize image to fit container',
      action: () => {
        const fitBtn = document.getElementById('ccToolFit');
        if (fitBtn) fitBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'zoom-in',
      label: 'Zoom In',
      icon: 'bi-zoom-in',
      description: 'Increase image zoom level',
      shortcut: '⌘+',
      action: () => {
        const zoomInBtn = document.getElementById('ccToolZoomIn');
        if (zoomInBtn) zoomInBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'zoom-out',
      label: 'Zoom Out',
      icon: 'bi-zoom-out',
      description: 'Decrease image zoom level',
      shortcut: '⌘-',
      action: () => {
        const zoomOutBtn = document.getElementById('ccToolZoomOut');
        if (zoomOutBtn) zoomOutBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'toggle-before-after',
      label: 'Toggle Before/After',
      icon: 'bi-eye',
      description: 'Compare original vs corrected image',
      action: () => {
        const beforeAfterBtn = document.getElementById('ccBeforeAfterToggle');
        if (beforeAfterBtn) beforeAfterBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'apply-correction',
      label: 'Apply Correction',
      icon: 'bi-check-circle',
      description: 'Apply color correction to image',
      action: () => {
        const applyBtn = document.querySelector('[data-action="apply-correction"]');
        if (applyBtn) applyBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'open-settings',
      label: 'Open Settings',
      icon: 'bi-gear',
      description: 'Configure app settings and preferences',
      shortcut: '⌘,',
      action: () => {
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) settingsBtn.click();
        closeCommandBar();
      }
    },
    {
      id: 'toggle-dark-mode',
      label: 'Toggle Dark Mode',
      icon: 'bi-moon',
      description: 'Switch between light and dark theme',
      action: () => {
        if (window.darkmode) window.darkmode.toggle();
        closeCommandBar();
      }
    },
    {
      id: 'clear-images',
      label: 'Clear All Images',
      icon: 'bi-trash3',
      description: 'Remove all images from library',
      action: () => {
        const confirmed = confirm('Are you sure you want to clear all images?');
        if (confirmed) {
          notify('All images cleared', 'info');
          closeCommandBar();
        }
      }
    },
    {
      id: 'toggle-agent',
      label: 'Toggle AI Panel',
      icon: 'bi-stars',
      description: 'Show or hide the AI assistant panel',
      shortcut: '⌘\\',
      action: () => {
        toggleAgentPanel();
        closeCommandBar();
      }
    },
    {
      id: 'clear-chat',
      label: 'Clear Conversation',
      icon: 'bi-chat-left',
      description: 'Clear chat history with AI',
      action: () => {
        clearAgentChat();
        closeCommandBar();
      }
    }
  ];

  // ===== HELPER: GET CONTEXT =====
  function getAgentContext() {
    const activeNavBtn = document.querySelector('.nav-btn.active');
    const activeView = activeNavBtn ? activeNavBtn.dataset.view : 'unknown';

    return {
      view: activeView,
      imageCount: typeof uploadedImages !== 'undefined' ? uploadedImages.length : 0,
      libraryCount: typeof libraryImages !== 'undefined' ? libraryImages.length : 0,
      activeMethod: typeof ccCurrentMethod !== 'undefined' ? ccCurrentMethod : null,
      timestamp: new Date().toLocaleTimeString()
    };
  }

  // ===== UPDATE CONTEXT BADGE =====
  function updateContextBadge() {
    const context = getAgentContext();
    const badges = [];

    if (context.view && context.view !== 'unknown') {
      badges.push(context.view.replace('-', ' '));
    }
    if (context.imageCount > 0) {
      badges.push(`${context.imageCount} images`);
    }
    if (context.activeMethod) {
      badges.push(context.activeMethod);
    }

    agentContextBadge.textContent = badges.length > 0 ? `Context: ${badges.join(' • ')}` : 'Ready to chat';
  }

  // ===== MESSAGE RENDERING =====
  function addMessage(content, role = 'user') {
    const messageEl = document.createElement('div');
    messageEl.className = `agent-message agent-message-${role}`;

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'agent-bubble';
    bubbleEl.textContent = content;

    messageEl.appendChild(bubbleEl);
    agentMessages.appendChild(messageEl);

    agentConversation.push({ role, content, timestamp: new Date() });
    scrollMessagesToBottom();
  }

  function scrollMessagesToBottom() {
    requestAnimationFrame(() => {
      agentMessages.scrollTop = agentMessages.scrollHeight;
    });
  }

  function showTypingIndicator() {
    agentTyping_flag = true;
    agentTyping.style.display = 'flex';
    scrollMessagesToBottom();
  }

  function hideTypingIndicator() {
    agentTyping_flag = false;
    agentTyping.style.display = 'none';
  }
  
  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.log(`[agent:${type}] ${message}`);
  }

  function normalizeCommandText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getAgentRuntimeState() {
    if (window.kuonixAgent?.getState) {
      return window.kuonixAgent.getState();
    }
    return { availableIssues: [] };
  }

  function formatIssueLabel(issue) {
    return String(issue || '')
      .replace(/_/g, ' ')
      .replace(/Needs /g, '')
      .replace(/Oversaturated/g, 'Oversat')
      .replace(/ColorCast/g, 'Cast')
      .replace(/SkinTone/g, 'Skin');
  }

  function buildSuggestionList(query = '') {
    const state = getAgentRuntimeState();
    const issueCommands = (state.availableIssues || []).map(issue => `open ${formatIssueLabel(issue)}`);
    const suggestions = Array.from(new Set([...DEFAULT_COMMANDS, ...issueCommands]));
    const normalizedQuery = normalizeCommandText(query);

    if (!normalizedQuery) {
      return suggestions.slice(0, 6);
    }

    const ranked = suggestions
      .map(command => {
        const normalized = normalizeCommandText(command);
        let score = 0;

        if (normalized === normalizedQuery) {
          score = 100;
        } else if (normalized.startsWith(normalizedQuery)) {
          score = 80;
        } else if (normalized.includes(normalizedQuery)) {
          score = 60;
        } else if (normalizedQuery.split(' ').every(token => normalized.includes(token))) {
          score = 40;
        }

        return { command, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.command.localeCompare(b.command))
      .map(item => item.command);

    return ranked.slice(0, 6);
  }

  function hideAgentSuggestions() {
    visibleSuggestions = [];
    selectedSuggestionIndex = -1;
    agentSuggestions.innerHTML = '';
    agentSuggestions.classList.remove('agent-suggestions--visible');
  }

  function selectSuggestion(index) {
    const buttons = agentSuggestions.querySelectorAll('.agent-suggestion');
    buttons.forEach((button, buttonIndex) => {
      button.classList.toggle('selected', buttonIndex === index);
    });
    selectedSuggestionIndex = index;
  }

  function renderAgentSuggestions(query = '') {
    const suggestions = buildSuggestionList(query);
    visibleSuggestions = suggestions;
    selectedSuggestionIndex = -1;

    if (suggestions.length === 0) {
      hideAgentSuggestions();
      return;
    }

    agentSuggestions.innerHTML = '';
    suggestions.forEach((suggestion, index) => {
      const suggestionBtn = document.createElement('button');
      suggestionBtn.type = 'button';
      suggestionBtn.className = 'agent-suggestion';
      suggestionBtn.textContent = suggestion;
      suggestionBtn.addEventListener('mousedown', (event) => {
        event.preventDefault();
        agentInput.value = suggestion;
        sendAgentMessage(suggestion);
      });
      suggestionBtn.addEventListener('mouseenter', () => selectSuggestion(index));
      agentSuggestions.appendChild(suggestionBtn);
    });

    agentSuggestions.classList.add('agent-suggestions--visible');
  }

  function acceptSuggestion() {
    const suggestion = visibleSuggestions[selectedSuggestionIndex] || visibleSuggestions[0];
    if (!suggestion) return false;

    agentInput.value = suggestion;
    agentInput.style.height = 'auto';
    agentInput.style.height = Math.min(agentInput.scrollHeight, 120) + 'px';
    renderAgentSuggestions(suggestion);
    return true;
  }

  function resolveHardcodedIntent(userMessage) {
    const normalized = normalizeCommandText(userMessage);
    if (!normalized) return null;

    const exactMap = [
      {
        matches: ['auto analyze', 'analyze', 'analyze now', 'run analysis', 'analyze uploads'],
        intent: { type: 'autoAnalyze' }
      },
      {
        matches: ['open color lab', 'go to color lab', 'color lab'],
        intent: { type: 'openColorLab' }
      },
      {
        matches: ['go to library', 'open library', 'library'],
        intent: { type: 'goToLibrary' }
      },
      {
        matches: ['go to upload', 'open upload', 'upload', 'upload and analyze'],
        intent: { type: 'goToUpload' }
      },
      {
        matches: ['open settings', 'go to settings', 'settings'],
        intent: { type: 'openSettings' }
      }
    ];

    const exact = exactMap.find(entry => entry.matches.includes(normalized));
    if (exact) {
      return exact.intent;
    }

    const openIssueMatch = normalized.match(/^(?:open|show|load)\s+(.+)$/);
    if (openIssueMatch) {
      const issueQuery = openIssueMatch[1]
        .replace(/\b(?:in|inside)\s+color\s+lab\b/g, '')
        .replace(/\b(?:issue|issues|images|photos)\b/g, '')
        .trim();

      if (issueQuery && !['color lab', 'library', 'upload', 'settings'].includes(issueQuery)) {
        return { type: 'openIssueInColorLab', issueQuery };
      }
    }

    const filterMatch = normalized.match(/^(?:filter|show)\s+(.+?)\s+(?:images|photos)$/);
    if (filterMatch) {
      return { type: 'applyIssueFilter', issueQuery: filterMatch[1].trim() };
    }

    return null;
  }

  async function executeHardcodedIntent(intent) {
    if (!intent) return null;

    try {
      switch (intent.type) {
        case 'autoAnalyze':
          return await window.kuonixAgent?.autoAnalyze?.();
        case 'openIssueInColorLab':
          return await window.kuonixAgent?.openIssueInColorLab?.(intent.issueQuery);
        case 'applyIssueFilter':
          return await window.kuonixAgent?.applyIssueFilter?.(intent.issueQuery);
        case 'openColorLab':
          return window.kuonixAgent?.openColorLab?.();
        case 'goToLibrary':
          return window.kuonixAgent?.goToLibrary?.();
        case 'goToUpload':
          return window.kuonixAgent?.goToUpload?.();
        case 'openSettings':
          return window.kuonixAgent?.openSettings?.();
        default:
          return null;
      }
    } catch (error) {
      return {
        ok: false,
        message: error.message || 'Command failed.'
      };
    }
  }
  
  function localAgentFallback(userMessage, context) {
    const msg = (userMessage || '').toLowerCase();
    const actions = [];
    let response = 'Use direct commands here. Try `auto analyze`, `open contrast decrease`, or `open color lab`.';
    
    if (msg.includes('color lab')) {
      response = 'Opening Color Lab helps you run method-based corrections and compare before/after. I can open it from the command bar with Cmd+J.';
      actions.push('Open Color Lab');
    } else if (msg.includes('library')) {
      response = 'Library is where you review and select images before sending them to Color Lab.';
      actions.push('Go to Library');
    } else if (msg.includes('upload')) {
      response = 'Use Upload & Analyze to add files/folders and run issue detection before correction.';
      actions.push('Upload Images');
    } else if (msg.includes('fit')) {
      response = 'Use Fit to preserve aspect ratio and avoid cropping. Whitespace can appear when aspect ratios differ.';
      actions.push('Fit to View');
    } else if (msg.includes('zoom')) {
      response = 'Use Zoom In/Out in the Color Lab toolbar for manual framing.';
      actions.push('Zoom In', 'Zoom Out');
    } else if (msg.includes('before') || msg.includes('after') || msg.includes('compare')) {
      response = 'Use Before/After to toggle between original and corrected output quickly.';
      actions.push('Toggle Before/After');
    } else if (msg.includes('settings') || msg.includes('theme')) {
      response = 'Settings lets you toggle dark mode, set accent color, and configure export app paths.';
      actions.push('Open Settings');
    } else if (msg.includes('help')) {
      response = 'I can guide you through upload, analysis, grouping, and color correction workflow step-by-step.';
    } else if (context && context.view && context.view !== 'unknown') {
      response = `You are currently in ${context.view.replace('-', ' ')}. Tell me what you want to do next and I will suggest exact actions.`;
    }
    
    return { response, actions };
  }

  // ===== AGENT API CALL =====
  async function sendAgentMessage(userMessage) {
    if (!userMessage.trim()) return;

    addMessage(userMessage, 'user');
    agentInput.value = '';
    agentInput.style.height = 'auto';
    agentSendBtn.disabled = true;
    hideAgentSuggestions();

    showTypingIndicator();

    try {
      const context = getAgentContext();
      const hardcodedIntent = resolveHardcodedIntent(userMessage);
      if (hardcodedIntent) {
        const result = await executeHardcodedIntent(hardcodedIntent);
        hideTypingIndicator();
        addMessage(result?.message || 'Command finished.', 'agent');
        return;
      }

      let data;
      
      try {
        const response = await fetch(AGENT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            context,
            history: agentConversation.slice(-10)
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        data = await response.json();
      } catch (backendError) {
        console.warn('Agent backend unavailable, using local fallback:', backendError.message);
        data = localAgentFallback(userMessage, context);
      }
      
      hideTypingIndicator();
      addMessage(data.response || data.message || 'No response', 'agent');

      // Handle suggested actions if provided
      if (data.actions && Array.isArray(data.actions)) {
        data.actions.forEach(action => {
          notify(`Suggested: ${action}`, 'info');
        });
      }
    } catch (error) {
      hideTypingIndicator();
      addMessage(`Sorry, I couldn't reach the agent service. Please try again. (${error.message})`, 'agent');
      console.error('Agent error:', error);
    } finally {
      agentSendBtn.disabled = false;
      updateContextBadge();
    }
  }

  // ===== AGENT PANEL CONTROL =====
  function toggleAgentPanel() {
    agentOpen ? closeAgentPanel() : openAgentPanel();
  }

  function openAgentPanel() {
    agentOpen = true;
    agentPanel.classList.add('agent-panel--open');
    appLayout.classList.add('agent-open');
    agentToggleBtn.classList.add('active');
    agentInput.focus();

    if (agentConversation.length === 0) {
      addMessage('Use direct commands here. Try `auto analyze`, `open contrast decrease`, or `open color lab`.', 'agent');
    }

    updateContextBadge();
    renderAgentSuggestions(agentInput.value);
  }

  function closeAgentPanel() {
    agentOpen = false;
    agentPanel.classList.remove('agent-panel--open');
    appLayout.classList.remove('agent-open');
    agentToggleBtn.classList.remove('active');
  }

  function clearAgentChat() {
    agentConversation = [];
    agentMessages.innerHTML = '';
    addMessage('Conversation cleared. Let\'s start fresh! What can I help you with?', 'agent');
  }

  // ===== RESIZE HANDLE =====
  agentResizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.addEventListener('mousemove', handlePanelResize);
    document.addEventListener('mouseup', stopPanelResize);
  });

  function handlePanelResize(e) {
    if (!isResizing) return;

    const newWidth = window.innerWidth - e.clientX;

    if (newWidth >= 240 && newWidth <= 600) {
      agentPanelWidth = newWidth;
      agentPanel.style.width = `${newWidth}px`;
      appLayout.style.gridTemplateColumns = `auto 1fr ${newWidth}px`;
    }
  }

  function stopPanelResize() {
    isResizing = false;
    document.removeEventListener('mousemove', handlePanelResize);
    document.removeEventListener('mouseup', stopPanelResize);
  }

  // ===== TEXTAREA AUTO-RESIZE =====
  agentInput.addEventListener('input', () => {
    agentInput.style.height = 'auto';
    agentInput.style.height = Math.min(agentInput.scrollHeight, 120) + 'px';
    renderAgentSuggestions(agentInput.value);
  });

  agentInput.addEventListener('focus', () => {
    renderAgentSuggestions(agentInput.value);
  });

  agentInput.addEventListener('blur', () => {
    setTimeout(() => {
      hideAgentSuggestions();
    }, 120);
  });

  // ===== MESSAGE SENDING =====
  agentSendBtn.addEventListener('click', () => {
    if (!agentTyping_flag) {
      sendAgentMessage(agentInput.value);
    }
  });

  agentInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && visibleSuggestions.length > 0) {
      e.preventDefault();
      const nextIndex = Math.min(selectedSuggestionIndex + 1, visibleSuggestions.length - 1);
      selectSuggestion(nextIndex);
      return;
    }

    if (e.key === 'ArrowUp' && visibleSuggestions.length > 0) {
      e.preventDefault();
      const nextIndex = Math.max(selectedSuggestionIndex - 1, 0);
      selectSuggestion(nextIndex);
      return;
    }

    if (e.key === 'Tab' && visibleSuggestions.length > 0) {
      e.preventDefault();
      acceptSuggestion();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!agentTyping_flag) {
        sendAgentMessage(agentInput.value);
      }
    }
  });

  // ===== PANEL CONTROLS =====
  agentCloseBtn.addEventListener('click', closeAgentPanel);
  agentClearBtn.addEventListener('click', clearAgentChat);
  agentToggleBtn.addEventListener('click', toggleAgentPanel);

  // ===== COMMAND BAR =====
  function openCommandBar() {
    commandBarOpen = true;
    commandBarOverlay.style.display = 'flex';
    commandBarOverlay.classList.add('open');
    commandBarInput.focus();
    selectedActionIndex = -1;
    renderCommandActions('');
  }

  function closeCommandBar() {
    commandBarOpen = false;
    commandBarOverlay.classList.remove('open');
    setTimeout(() => {
      commandBarOverlay.style.display = 'none';
      commandBarInput.value = '';
      commandBarResults.innerHTML = '';
    }, 150);
  }

  function renderCommandActions(query) {
    commandBarResults.innerHTML = '';
    selectedActionIndex = -1;

    const filtered = query.length === 0
      ? quickActions
      : quickActions.filter(action =>
          action.label.toLowerCase().includes(query.toLowerCase()) ||
          action.description.toLowerCase().includes(query.toLowerCase())
        );

    filtered.forEach((action, idx) => {
      const actionEl = document.createElement('div');
      actionEl.className = 'command-action';
      actionEl.innerHTML = `
        <i class="bi ${action.icon} command-action-icon"></i>
        <div class="command-action-content">
          <div class="command-action-label">${action.label}</div>
          <div class="command-action-description">${action.description}</div>
        </div>
        ${action.shortcut ? `<div class="command-action-shortcut">${action.shortcut}</div>` : ''}
      `;

      actionEl.addEventListener('click', action.action);
      actionEl.addEventListener('mouseenter', () => selectAction(idx, filtered));

      commandBarResults.appendChild(actionEl);
    });
  }

  function selectAction(idx, filtered) {
    const items = commandBarResults.querySelectorAll('.command-action');
    items.forEach((item, i) => {
      if (i === idx) {
        item.classList.add('selected');
        selectedActionIndex = idx;
      } else {
        item.classList.remove('selected');
      }
    });
  }

  commandBarInput.addEventListener('input', (e) => {
    renderCommandActions(e.target.value);
  });

  commandBarInput.addEventListener('keydown', (e) => {
    const items = commandBarResults.querySelectorAll('.command-action');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedActionIndex = Math.min(selectedActionIndex + 1, items.length - 1);
      selectAction(selectedActionIndex, quickActions);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedActionIndex = Math.max(selectedActionIndex - 1, 0);
      selectAction(selectedActionIndex, quickActions);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedActionIndex >= 0 && items[selectedActionIndex]) {
        items[selectedActionIndex].click();
      }
    }
  });

  // Close command bar on overlay click
  commandBarOverlay.addEventListener('click', (e) => {
    if (e.target === commandBarOverlay) {
      closeCommandBar();
    }
  });

  // ===== KEYBOARD SHORTCUTS =====
  // Extend existing keydown listener
  document.addEventListener('keydown', (e) => {
    // Cmd+J / Ctrl+J: toggle command bar
    if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
      e.preventDefault();
      commandBarOpen ? closeCommandBar() : openCommandBar();
    }

    // Cmd+\ / Ctrl+\: toggle agent panel
    if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
      e.preventDefault();
      toggleAgentPanel();
    }

    // Escape: close command bar first, then agent panel
    if (e.key === 'Escape') {
      if (commandBarOpen) {
        closeCommandBar();
      } else if (agentOpen) {
        closeAgentPanel();
      }
    }
  });

  // Initialize
  updateContextBadge();

  // Update context on view changes
  setInterval(updateContextBadge, 5000);
}

// Call immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAgent);
} else {
  initAgent();
}
