/**
 * ============================================================================
 * ALABOBAI - Ultra Agent V4.0 Smart Command Bar
 * World-class Spotlight-style command interface
 * ============================================================================
 */

class SmartCommandBar {
  constructor() {
    this.isOpen = false;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recognition = null;
    this.currentDepartment = 'Executive';
    this.commandHistory = this.loadHistory();
    this.selectedSuggestionIndex = -1;
    this.currentSuggestions = [];
    this.ghostText = '';

    // Slash commands
    this.slashCommands = [
      { command: '/legal', description: 'Switch to Legal department', icon: 'L', action: () => this.switchDepartment('Legal') },
      { command: '/finance', description: 'Switch to Finance department', icon: 'F', action: () => this.switchDepartment('Finance') },
      { command: '/executive', description: 'Switch to Executive department', icon: 'E', action: () => this.switchDepartment('Executive') },
      { command: '/funding', description: 'Switch to Funding department', icon: '$', action: () => this.switchDepartment('Funding') },
      { command: '/marketing', description: 'Switch to Marketing department', icon: 'M', action: () => this.switchDepartment('Marketing') },
      { command: '/template', description: 'Open template library', icon: 'T', action: () => this.openTemplateLibrary() },
      { command: '/history', description: 'Search command history', icon: 'H', action: () => this.openHistorySearch() },
      { command: '/help', description: 'Show command guide', icon: '?', action: () => this.showHelp() },
      { command: '/clear', description: 'Clear current input', icon: 'X', action: () => this.clearInput() },
      { command: '/voice', description: 'Start voice input', icon: 'V', action: () => this.toggleVoiceInput() },
    ];

    // Template library
    this.templates = {
      Executive: [
        { name: 'Quarterly Report', prompt: 'Generate a comprehensive quarterly business report including revenue, KPIs, and strategic initiatives', icon: 'Q' },
        { name: 'Board Presentation', prompt: 'Create a board meeting presentation with executive summary, financials, and roadmap', icon: 'B' },
        { name: 'Strategic Analysis', prompt: 'Conduct SWOT analysis and competitive landscape assessment for our market position', icon: 'S' },
        { name: 'Investor Update', prompt: 'Draft investor update email with key milestones, metrics, and upcoming goals', icon: 'I' },
      ],
      Legal: [
        { name: 'Contract Review', prompt: 'Review and summarize the key terms, risks, and obligations in this contract', icon: 'C' },
        { name: 'NDA Draft', prompt: 'Generate a mutual non-disclosure agreement for business discussions', icon: 'N' },
        { name: 'Compliance Check', prompt: 'Audit current processes for regulatory compliance and identify gaps', icon: 'A' },
        { name: 'Legal Brief', prompt: 'Prepare a legal brief summarizing case facts, issues, and recommendations', icon: 'L' },
      ],
      Finance: [
        { name: 'Budget Analysis', prompt: 'Analyze current budget allocation and recommend optimizations', icon: 'B' },
        { name: 'Financial Forecast', prompt: 'Create 12-month financial projection with revenue and expense modeling', icon: 'F' },
        { name: 'Expense Report', prompt: 'Generate detailed expense report with category breakdowns and trends', icon: 'E' },
        { name: 'ROI Calculator', prompt: 'Calculate return on investment for proposed initiative with sensitivity analysis', icon: 'R' },
      ],
      Marketing: [
        { name: 'Campaign Brief', prompt: 'Develop marketing campaign brief with target audience, messaging, and channels', icon: 'C' },
        { name: 'Content Calendar', prompt: 'Create 30-day content calendar with topics, formats, and distribution plan', icon: 'D' },
        { name: 'Brand Guidelines', prompt: 'Document brand voice, visual identity, and usage guidelines', icon: 'G' },
        { name: 'Competitor Analysis', prompt: 'Analyze top 5 competitors marketing strategies and identify opportunities', icon: 'A' },
      ],
      Funding: [
        { name: 'Pitch Deck', prompt: 'Create investor pitch deck with problem, solution, market, team, and financials', icon: 'P' },
        { name: 'Term Sheet Review', prompt: 'Analyze term sheet and highlight key terms, valuations, and implications', icon: 'T' },
        { name: 'Due Diligence Prep', prompt: 'Prepare due diligence documentation checklist and organize materials', icon: 'D' },
        { name: 'Funding Strategy', prompt: 'Develop fundraising strategy with timeline, targets, and investor pipeline', icon: 'S' },
      ],
    };

    // Smart suggestions based on context
    this.smartSuggestions = {
      Executive: [
        'Generate quarterly executive summary',
        'Analyze team performance metrics',
        'Create strategic planning document',
        'Draft stakeholder communication',
      ],
      Legal: [
        'Review contract for potential risks',
        'Draft confidentiality agreement',
        'Summarize regulatory requirements',
        'Prepare litigation risk assessment',
      ],
      Finance: [
        'Calculate monthly burn rate',
        'Generate P&L statement analysis',
        'Forecast Q4 revenue projections',
        'Audit expense categories',
      ],
      Marketing: [
        'Create social media campaign',
        'Analyze conversion funnel',
        'Draft press release',
        'Generate A/B test variants',
      ],
    };

    this.init();
  }

  init() {
    this.createModalStructure();
    this.bindEvents();
    this.initVoiceRecognition();
    this.enhanceOriginalInput();
  }

  createModalStructure() {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'command-modal-overlay';
    modal.id = 'commandModal';
    modal.innerHTML = `
      <div class="command-modal">
        <div class="command-modal-header">
          <div class="command-modal-badge">
            <span class="command-modal-icon">⌘</span>
            <span class="command-modal-label">Ultra Command</span>
          </div>
          <div class="command-modal-shortcut">
            <kbd>ESC</kbd> to close
          </div>
        </div>

        <div class="command-input-wrapper">
          <div class="command-input-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <div class="command-input-field-wrapper">
            <input type="text"
                   class="command-modal-input"
                   id="commandModalInput"
                   placeholder="Type a command or search..."
                   autocomplete="off"
                   spellcheck="false">
            <span class="ghost-text" id="ghostText"></span>
          </div>
          <div class="command-tab-hint" id="tabHint">
            <kbd>TAB</kbd>
          </div>
          <button class="command-voice-btn" id="voiceBtn" title="Voice input (V)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <div class="voice-waveform" id="voiceWaveform">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </button>
        </div>

        <div class="command-suggestions" id="commandSuggestions">
          <!-- Suggestions will be populated here -->
        </div>

        <div class="command-footer">
          <div class="command-footer-item">
            <kbd>↑↓</kbd> Navigate
          </div>
          <div class="command-footer-item">
            <kbd>↵</kbd> Execute
          </div>
          <div class="command-footer-item">
            <kbd>/</kbd> Commands
          </div>
          <div class="command-footer-item active-dept" id="activeDeptBadge">
            <span class="dept-indicator"></span>
            <span id="activeDeptName">Executive</span>
          </div>
        </div>
      </div>

      <!-- Template Library Modal -->
      <div class="template-library" id="templateLibrary">
        <div class="template-library-header">
          <h3>Template Library</h3>
          <button class="template-close-btn" id="templateCloseBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="template-tabs" id="templateTabs">
          <!-- Tabs populated dynamically -->
        </div>
        <div class="template-grid" id="templateGrid">
          <!-- Templates populated dynamically -->
        </div>
      </div>

      <!-- Help Modal -->
      <div class="help-modal" id="helpModal">
        <div class="help-modal-content">
          <div class="help-header">
            <h3>Command Guide</h3>
            <button class="help-close-btn" id="helpCloseBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="help-sections">
            <div class="help-section">
              <h4>Keyboard Shortcuts</h4>
              <div class="help-row"><kbd>⌘K</kbd> Open command bar</div>
              <div class="help-row"><kbd>ESC</kbd> Close command bar</div>
              <div class="help-row"><kbd>TAB</kbd> Accept suggestion</div>
              <div class="help-row"><kbd>↑↓</kbd> Navigate suggestions</div>
              <div class="help-row"><kbd>V</kbd> Toggle voice input</div>
            </div>
            <div class="help-section">
              <h4>Slash Commands</h4>
              <div class="help-row"><code>/legal</code> Switch to Legal dept</div>
              <div class="help-row"><code>/template</code> Open templates</div>
              <div class="help-row"><code>/history</code> Command history</div>
              <div class="help-row"><code>/help</code> This guide</div>
            </div>
            <div class="help-section">
              <h4>Smart Features</h4>
              <p>AI autocomplete suggests commands based on your department context. Recent commands appear at the top for quick access.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modal = modal;
    this.modalInput = document.getElementById('commandModalInput');
    this.suggestionsContainer = document.getElementById('commandSuggestions');
    this.ghostTextElement = document.getElementById('ghostText');
    this.tabHint = document.getElementById('tabHint');
  }

  enhanceOriginalInput() {
    const originalInput = document.getElementById('commandInput');
    if (!originalInput) return;

    // Add click handler to open modal
    originalInput.addEventListener('click', (e) => {
      e.preventDefault();
      this.open();
    });

    // Add focus handler
    originalInput.addEventListener('focus', (e) => {
      e.preventDefault();
      originalInput.blur();
      this.open();
    });

    // Update placeholder
    originalInput.placeholder = 'Press ⌘K to command...';

    // Add visual indicator
    const container = originalInput.closest('.command-input-container');
    if (container) {
      const hint = document.createElement('div');
      hint.className = 'command-input-hint';
      hint.innerHTML = '<kbd>⌘K</kbd>';
      container.appendChild(hint);
    }
  }

  bindEvents() {
    // Global keyboard shortcut
    document.addEventListener('keydown', (e) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }

      // ESC to close
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Modal overlay click to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Input events
    this.modalInput.addEventListener('input', () => this.handleInput());
    this.modalInput.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Voice button
    document.getElementById('voiceBtn').addEventListener('click', () => this.toggleVoiceInput());

    // Template library close
    document.getElementById('templateCloseBtn').addEventListener('click', () => this.closeTemplateLibrary());

    // Help modal close
    document.getElementById('helpCloseBtn').addEventListener('click', () => this.closeHelp());

    // Listen for department changes
    document.querySelectorAll('.dept-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const deptName = chip.textContent.trim();
        this.currentDepartment = deptName;
        this.updateDepartmentBadge();
      });
    });
  }

  initVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        this.modalInput.value = transcript;
        this.handleInput();
      };

      this.recognition.onend = () => {
        this.stopVoiceRecording();
      };

      this.recognition.onerror = () => {
        this.stopVoiceRecording();
      };
    }
  }

  open() {
    this.isOpen = true;
    this.modal.classList.add('active');
    this.modalInput.value = '';
    this.ghostTextElement.textContent = '';
    this.tabHint.style.display = 'none';
    this.selectedSuggestionIndex = -1;

    // Focus input after animation
    setTimeout(() => {
      this.modalInput.focus();
      this.showDefaultSuggestions();
    }, 100);

    this.updateDepartmentBadge();
  }

  close() {
    this.isOpen = false;
    this.modal.classList.remove('active');
    this.closeTemplateLibrary();
    this.closeHelp();
    this.stopVoiceRecording();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  handleInput() {
    const value = this.modalInput.value;
    this.selectedSuggestionIndex = -1;

    if (value.startsWith('/')) {
      this.showSlashCommands(value);
    } else if (value.length > 0) {
      this.showSmartSuggestions(value);
    } else {
      this.showDefaultSuggestions();
    }

    this.updateGhostText(value);
  }

  handleKeydown(e) {
    const suggestions = this.suggestionsContainer.querySelectorAll('.suggestion-item');

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, suggestions.length - 1);
        this.highlightSuggestion(suggestions);
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, -1);
        this.highlightSuggestion(suggestions);
        break;

      case 'Tab':
        e.preventDefault();
        if (this.ghostText) {
          this.modalInput.value = this.ghostText;
          this.ghostTextElement.textContent = '';
          this.tabHint.style.display = 'none';
          this.handleInput();
        } else if (this.selectedSuggestionIndex >= 0) {
          this.selectSuggestion(this.selectedSuggestionIndex);
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (this.selectedSuggestionIndex >= 0) {
          this.selectSuggestion(this.selectedSuggestionIndex);
        } else {
          this.executeCommand(this.modalInput.value);
        }
        break;

      case 'v':
        if (!e.metaKey && !e.ctrlKey && e.target.selectionStart === 0) {
          // Only toggle voice if at beginning of empty input
          if (this.modalInput.value === '') {
            e.preventDefault();
            this.toggleVoiceInput();
          }
        }
        break;
    }
  }

  highlightSuggestion(suggestions) {
    suggestions.forEach((s, i) => {
      s.classList.toggle('selected', i === this.selectedSuggestionIndex);
    });

    // Scroll selected into view
    if (this.selectedSuggestionIndex >= 0 && suggestions[this.selectedSuggestionIndex]) {
      suggestions[this.selectedSuggestionIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  selectSuggestion(index) {
    if (this.currentSuggestions[index]) {
      const suggestion = this.currentSuggestions[index];

      if (suggestion.type === 'slash') {
        suggestion.action();
        this.modalInput.value = '';
        this.handleInput();
      } else if (suggestion.type === 'template') {
        this.executeCommand(suggestion.prompt);
      } else {
        this.executeCommand(suggestion.text);
      }
    }
  }

  showDefaultSuggestions() {
    const recentCommands = this.commandHistory.slice(0, 3);
    const deptSuggestions = this.smartSuggestions[this.currentDepartment] || this.smartSuggestions.Executive;

    this.currentSuggestions = [];

    let html = '';

    // Recent commands section
    if (recentCommands.length > 0) {
      html += `<div class="suggestion-section">
        <div class="suggestion-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
          </svg>
          Recent Commands
        </div>`;

      recentCommands.forEach((cmd, i) => {
        this.currentSuggestions.push({ type: 'history', text: cmd });
        html += `
          <div class="suggestion-item" data-index="${this.currentSuggestions.length - 1}">
            <span class="suggestion-icon history">↺</span>
            <span class="suggestion-text">${this.escapeHtml(cmd)}</span>
            <span class="suggestion-meta">history</span>
          </div>`;
      });

      html += '</div>';
    }

    // Smart suggestions section
    html += `<div class="suggestion-section">
      <div class="suggestion-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
        </svg>
        Popular in ${this.currentDepartment}
      </div>`;

    deptSuggestions.forEach((suggestion, i) => {
      this.currentSuggestions.push({ type: 'smart', text: suggestion });
      html += `
        <div class="suggestion-item" data-index="${this.currentSuggestions.length - 1}">
          <span class="suggestion-icon smart">*</span>
          <span class="suggestion-text">${suggestion}</span>
          <span class="suggestion-meta">suggested</span>
        </div>`;
    });

    html += '</div>';

    // Quick actions
    html += `<div class="suggestion-section">
      <div class="suggestion-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
        </svg>
        Quick Actions
      </div>
      <div class="quick-actions">
        <button class="quick-action-btn" data-action="template">
          Templates
        </button>
        <button class="quick-action-btn" data-action="voice">
          Voice
        </button>
        <button class="quick-action-btn" data-action="history">
          History
        </button>
        <button class="quick-action-btn" data-action="help">
          Help
        </button>
      </div>
    </div>`;

    this.suggestionsContainer.innerHTML = html;
    this.bindSuggestionEvents();
  }

  showSlashCommands(value) {
    const searchTerm = value.slice(1).toLowerCase();
    const filtered = this.slashCommands.filter(cmd =>
      cmd.command.toLowerCase().includes(searchTerm) ||
      cmd.description.toLowerCase().includes(searchTerm)
    );

    this.currentSuggestions = filtered.map(cmd => ({
      type: 'slash',
      text: cmd.command,
      ...cmd
    }));

    let html = `<div class="suggestion-section">
      <div class="suggestion-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 17l6-6-6-6M12 19h8"/>
        </svg>
        Slash Commands
      </div>`;

    if (filtered.length === 0) {
      html += `<div class="no-results">No commands found for "${searchTerm}"</div>`;
    } else {
      filtered.forEach((cmd, i) => {
        html += `
          <div class="suggestion-item slash-command" data-index="${i}">
            <span class="suggestion-icon slash">${cmd.icon}</span>
            <div class="suggestion-content">
              <span class="suggestion-command">${cmd.command}</span>
              <span class="suggestion-desc">${cmd.description}</span>
            </div>
            <kbd>↵</kbd>
          </div>`;
      });
    }

    html += '</div>';
    this.suggestionsContainer.innerHTML = html;
    this.bindSuggestionEvents();
  }

  showSmartSuggestions(value) {
    const deptSuggestions = this.smartSuggestions[this.currentDepartment] || [];
    const allSuggestions = [
      ...this.commandHistory,
      ...deptSuggestions,
      ...Object.values(this.templates).flat().map(t => t.prompt)
    ];

    // Fuzzy match
    const searchLower = value.toLowerCase();
    const matched = allSuggestions
      .filter(s => s.toLowerCase().includes(searchLower))
      .slice(0, 6);

    this.currentSuggestions = matched.map(text => ({ type: 'smart', text }));

    let html = `<div class="suggestion-section">
      <div class="suggestion-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        Suggestions
      </div>`;

    if (matched.length === 0) {
      html += `
        <div class="suggestion-item execute-new" data-index="-1">
          <span class="suggestion-icon new">→</span>
          <span class="suggestion-text">Execute: "${this.escapeHtml(value)}"</span>
          <kbd>↵</kbd>
        </div>`;
    } else {
      matched.forEach((text, i) => {
        const highlighted = this.highlightMatch(text, value);
        html += `
          <div class="suggestion-item" data-index="${i}">
            <span class="suggestion-icon match">◎</span>
            <span class="suggestion-text">${highlighted}</span>
            <span class="suggestion-meta">match</span>
          </div>`;
      });
    }

    html += '</div>';
    this.suggestionsContainer.innerHTML = html;
    this.bindSuggestionEvents();
  }

  updateGhostText(value) {
    if (value.length < 2) {
      this.ghostText = '';
      this.ghostTextElement.textContent = '';
      this.tabHint.style.display = 'none';
      return;
    }

    // Find matching suggestion
    const deptSuggestions = this.smartSuggestions[this.currentDepartment] || [];
    const allSuggestions = [...this.commandHistory, ...deptSuggestions];

    const match = allSuggestions.find(s =>
      s.toLowerCase().startsWith(value.toLowerCase()) && s.length > value.length
    );

    if (match) {
      this.ghostText = match;
      // Show only the completion part
      const completion = match.slice(value.length);
      this.ghostTextElement.textContent = completion;
      this.ghostTextElement.style.left = this.getTextWidth(value) + 'px';
      this.tabHint.style.display = 'flex';
    } else {
      this.ghostText = '';
      this.ghostTextElement.textContent = '';
      this.tabHint.style.display = 'none';
    }
  }

  getTextWidth(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = getComputedStyle(this.modalInput).font;
    return ctx.measureText(text).width + 60; // 60px for padding + icon
  }

  bindSuggestionEvents() {
    // Suggestion items
    this.suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        if (index >= 0) {
          this.selectSuggestion(index);
        } else {
          this.executeCommand(this.modalInput.value);
        }
      });

      item.addEventListener('mouseenter', () => {
        const index = parseInt(item.dataset.index);
        if (index >= 0) {
          this.selectedSuggestionIndex = index;
          this.highlightSuggestion(this.suggestionsContainer.querySelectorAll('.suggestion-item'));
        }
      });
    });

    // Quick action buttons
    this.suggestionsContainer.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'template': this.openTemplateLibrary(); break;
          case 'voice': this.toggleVoiceInput(); break;
          case 'history': this.openHistorySearch(); break;
          case 'help': this.showHelp(); break;
        }
      });
    });
  }

  highlightMatch(text, query) {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return this.escapeHtml(text);

    const before = text.slice(0, index);
    const match = text.slice(index, index + query.length);
    const after = text.slice(index + query.length);

    return `${this.escapeHtml(before)}<mark>${this.escapeHtml(match)}</mark>${this.escapeHtml(after)}`;
  }

  executeCommand(command) {
    if (!command.trim()) return;

    // Check for slash command
    if (command.startsWith('/')) {
      const slashCmd = this.slashCommands.find(c => c.command === command.trim());
      if (slashCmd) {
        slashCmd.action();
        return;
      }
    }

    // Add to history
    this.addToHistory(command);

    // Close modal
    this.close();

    // Trigger execution on the original input
    const originalInput = document.getElementById('commandInput');
    if (originalInput) {
      originalInput.value = command;

      // Trigger the execute button
      const executeBtn = document.getElementById('executeBtn');
      if (executeBtn) {
        executeBtn.click();
      }
    }

    // Dispatch custom event
    document.dispatchEvent(new CustomEvent('commandExecuted', {
      detail: { command, department: this.currentDepartment }
    }));
  }

  // Voice Input
  toggleVoiceInput() {
    if (this.isRecording) {
      this.stopVoiceRecording();
    } else {
      this.startVoiceRecording();
    }
  }

  startVoiceRecording() {
    if (!this.recognition) {
      alert('Voice input is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    this.isRecording = true;
    const voiceBtn = document.getElementById('voiceBtn');
    const waveform = document.getElementById('voiceWaveform');

    voiceBtn.classList.add('recording');
    waveform.classList.add('active');
    this.modalInput.placeholder = 'Listening...';

    try {
      this.recognition.start();
    } catch (e) {
      this.stopVoiceRecording();
    }
  }

  stopVoiceRecording() {
    this.isRecording = false;
    const voiceBtn = document.getElementById('voiceBtn');
    const waveform = document.getElementById('voiceWaveform');

    voiceBtn.classList.remove('recording');
    waveform.classList.remove('active');
    this.modalInput.placeholder = 'Type a command or search...';

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
  }

  // Template Library
  openTemplateLibrary() {
    const library = document.getElementById('templateLibrary');
    library.classList.add('active');
    this.populateTemplates();
  }

  closeTemplateLibrary() {
    const library = document.getElementById('templateLibrary');
    library.classList.remove('active');
  }

  populateTemplates() {
    const tabs = document.getElementById('templateTabs');
    const grid = document.getElementById('templateGrid');

    // Create tabs
    let tabsHtml = '';
    Object.keys(this.templates).forEach((dept, i) => {
      const isActive = dept === this.currentDepartment || (i === 0 && !this.templates[this.currentDepartment]);
      tabsHtml += `<button class="template-tab ${isActive ? 'active' : ''}" data-dept="${dept}">${dept}</button>`;
    });
    tabs.innerHTML = tabsHtml;

    // Bind tab events
    tabs.querySelectorAll('.template-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.querySelectorAll('.template-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderTemplateGrid(tab.dataset.dept);
      });
    });

    // Render initial grid
    const activeDept = this.templates[this.currentDepartment] ? this.currentDepartment : Object.keys(this.templates)[0];
    this.renderTemplateGrid(activeDept);
  }

  renderTemplateGrid(department) {
    const grid = document.getElementById('templateGrid');
    const templates = this.templates[department] || [];

    grid.innerHTML = templates.map(t => `
      <div class="template-card" data-prompt="${this.escapeHtml(t.prompt)}">
        <div class="template-card-icon">${t.icon}</div>
        <div class="template-card-name">${t.name}</div>
        <div class="template-card-preview">${t.prompt.slice(0, 60)}...</div>
        <div class="template-card-action">
          <span>Click to use</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
      </div>
    `).join('');

    // Bind click events
    grid.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        this.closeTemplateLibrary();
        this.modalInput.value = prompt;
        this.handleInput();
      });
    });
  }

  // History
  openHistorySearch() {
    this.modalInput.value = '';
    this.showHistorySuggestions();
  }

  showHistorySuggestions() {
    this.currentSuggestions = this.commandHistory.map(text => ({ type: 'history', text }));

    let html = `<div class="suggestion-section">
      <div class="suggestion-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
        Command History
      </div>`;

    if (this.commandHistory.length === 0) {
      html += `<div class="no-results">No command history yet</div>`;
    } else {
      this.commandHistory.forEach((cmd, i) => {
        html += `
          <div class="suggestion-item" data-index="${i}">
            <span class="suggestion-icon history">↺</span>
            <span class="suggestion-text">${this.escapeHtml(cmd)}</span>
            <button class="delete-history" data-index="${i}" title="Remove">×</button>
          </div>`;
      });
    }

    html += '</div>';
    this.suggestionsContainer.innerHTML = html;

    // Bind delete buttons
    this.suggestionsContainer.querySelectorAll('.delete-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        this.commandHistory.splice(index, 1);
        this.saveHistory();
        this.showHistorySuggestions();
      });
    });

    this.bindSuggestionEvents();
  }

  // Help
  showHelp() {
    document.getElementById('helpModal').classList.add('active');
  }

  closeHelp() {
    document.getElementById('helpModal').classList.remove('active');
  }

  // Department switching
  switchDepartment(dept) {
    this.currentDepartment = dept;
    this.updateDepartmentBadge();

    // Update department chips in main UI
    document.querySelectorAll('.dept-chip').forEach(chip => {
      const chipDept = chip.textContent.trim();
      chip.classList.toggle('active', chipDept.includes(dept));
    });

    // Show feedback
    this.showToast(`Switched to ${dept} department`);
  }

  updateDepartmentBadge() {
    const badge = document.getElementById('activeDeptName');
    if (badge) {
      badge.textContent = this.currentDepartment;
    }
  }

  showToast(message) {
    const existing = document.querySelector('.command-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'command-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  clearInput() {
    this.modalInput.value = '';
    this.ghostTextElement.textContent = '';
    this.tabHint.style.display = 'none';
    this.showDefaultSuggestions();
  }

  // History persistence
  loadHistory() {
    try {
      return JSON.parse(localStorage.getItem('alabobai_command_history') || '[]');
    } catch {
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem('alabobai_command_history', JSON.stringify(this.commandHistory));
    } catch {}
  }

  addToHistory(command) {
    // Remove duplicates
    this.commandHistory = this.commandHistory.filter(c => c !== command);
    // Add to beginning
    this.commandHistory.unshift(command);
    // Keep only last 20
    this.commandHistory = this.commandHistory.slice(0, 20);
    this.saveHistory();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.smartCommandBar = new SmartCommandBar();
});
