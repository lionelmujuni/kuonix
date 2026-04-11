/**
 * Agentic Window + Command Bar Module
 * Isolated functionality for AI assistant panel and command palette
 * No global pollution - all state contained in IIFE
 */

window.addEventListener('DOMContentLoaded', () => {
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

  const commandBarOverlay = document.getElementById('commandBarOverlay');
  const commandBarInput = document.getElementById('commandBarInput');
  const commandBarResults = document.getElementById('commandBarResults');

  // ===== STATE =====
  let agentOpen = false;
  let commandBarOpen = false;
  let agentConversation = [];
  let agentTyping_flag = false;
  let agentPanelWidth = 340;
  let isResizing = false;
  let selectedActionIndex = -1;

  // ===== QUICK ACTIONS LIST =====
  const quickActions = [
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
      id: 'fill-view',
      label: 'Fill View',
      icon: 'bi-bounding-box',
      description: 'Expand image to fill container',
      action: () => {
        const fillBtn = document.getElementById('ccToolFill');
        if (fillBtn) fillBtn.click();
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
          showToast('All images cleared', 'info');
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

  // ===== AGENT API CALL =====
  async function sendAgentMessage(userMessage) {
    if (!userMessage.trim()) return;

    addMessage(userMessage, 'user');
    agentInput.value = '';
    agentInput.style.height = 'auto';
    agentSendBtn.disabled = true;

    showTypingIndicator();

    try {
      const context = getAgentContext();
      const response = await fetch('http://localhost:8081/agent/chat', {
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

      const data = await response.json();
      hideTypingIndicator();
      addMessage(data.response || data.message || 'No response', 'agent');

      // Handle suggested actions if provided
      if (data.actions && Array.isArray(data.actions)) {
        data.actions.forEach(action => {
          showToast(`Suggested: ${action}`, 'info');
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
      addMessage('Hi! I\'m your Kuonix AI assistant. I can help you navigate the app, adjust image settings, and answer questions about your workflow. What can I do for you?', 'agent');
    }

    updateContextBadge();
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
  });

  // ===== MESSAGE SENDING =====
  agentSendBtn.addEventListener('click', () => {
    if (!agentTyping_flag) {
      sendAgentMessage(agentInput.value);
    }
  });

  agentInput.addEventListener('keydown', (e) => {
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
});
