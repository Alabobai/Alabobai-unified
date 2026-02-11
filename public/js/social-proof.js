/**
 * ============================================================================
 * ALABOBAI SOCIAL PROOF SYSTEM
 * Ultra Agent V4.0 - Real-time Trust & FOMO Engine
 * ============================================================================
 *
 * Creates a living, breathing platform feel with:
 * - Live user counter with animations
 * - Activity ticker with scrolling updates
 * - Notification toasts
 * - Animated statistics
 * - Logo wall with infinite scroll
 * - Live output feed
 * - Trust indicators
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // Base numbers - kept vague for credibility
    baseUserCount: 0, // Not used - replaced with vague messaging
    baseDocuments: 0, // Not used - replaced with vague messaging
    baseLegalSavings: 0, // Not used - replaced with vague messaging
    baseHoursSaved: 0, // Not used - replaced with vague messaging
    baseReviews: 0, // Not used - replaced with vague messaging

    // Animation timing
    counterDuration: 2500,
    toastInterval: { min: 15000, max: 45000 },
    tickerSpeed: 50,
    userCountUpdateInterval: { min: 30000, max: 90000 },

    // Activity data - anonymized for credibility
    // No fake names used - activity is described generically
    teamTypes: [
      'A startup team', 'A law firm', 'A SaaS company', 'An agency', 'A fintech team',
      'A healthcare team', 'An e-commerce team', 'A consulting firm', 'A VC firm',
      'An enterprise team', 'A creative team', 'A tech team'
    ],

    actions: [
      { text: 'Pitch deck generated', dept: 'Pitch' },
      { text: 'Investor update created', dept: 'Pitch' },
      { text: 'NDA drafted', dept: 'Legal' },
      { text: 'Employment contracts generated', dept: 'Legal' },
      { text: 'Marketing campaign created', dept: 'Marketing' },
      { text: 'Financial forecast completed', dept: 'Finance' },
      { text: 'Partnership agreement drafted', dept: 'Legal' },
      { text: 'Sales scripts generated', dept: 'Sales' },
      { text: 'Onboarding flow created', dept: 'HR' },
      { text: 'Support docs automated', dept: 'Support' },
      { text: 'Product roadmap built', dept: 'Product' },
      { text: 'Compliance docs created', dept: 'Legal' }
    ],

    outputs: [
      'Investor Update Q4',
      'Employee Handbook 2026',
      'Series A Pitch Deck',
      'Partnership Agreement',
      'Marketing Campaign',
      'Sales Playbook',
      'Customer Success Guide',
      'Product Roadmap',
      'Board Presentation',
      'Due Diligence Pack',
      'Fundraising Memo',
      'Employment Contract'
    ],

    timeSaved: ['hours of work', 'significant time', 'days of effort'],

    // Industry categories instead of fake company names
    industries: [
      'Startups', 'Agencies', 'Law Firms', 'Venture Capital', 'Consulting', 'E-commerce',
      'Healthcare', 'Fintech', 'Real Estate', 'SaaS', 'Creative Teams', 'Enterprise'
    ]
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  function random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }

  function animateCounter(element, start, end, duration, formatter = formatNumber) {
    const startTime = performance.now();
    const range = end - start;

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (range * easeOut));

      element.textContent = formatter(current);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // ============================================================================
  // LIVE USER COUNTER
  // ============================================================================

  function createUserCounter() {
    const container = document.createElement('div');
    container.className = 'sp-user-counter';
    // Changed from specific fake number to vague credible messaging
    container.innerHTML = `
      <div class="sp-user-counter-inner">
        <div class="sp-pulse"></div>
        <span class="sp-user-text">Join thousands of teams building with Alabobai</span>
      </div>
    `;

    return container;
  }

  // ============================================================================
  // ACTIVITY TICKER
  // ============================================================================

  function createActivityTicker() {
    const container = document.createElement('div');
    container.className = 'sp-activity-ticker';

    const track = document.createElement('div');
    track.className = 'sp-ticker-track';

    // Generate initial items
    const items = [];
    for (let i = 0; i < 20; i++) {
      items.push(generateTickerItem());
    }

    track.innerHTML = items.join('') + items.join(''); // Duplicate for seamless loop
    container.appendChild(track);

    return container;
  }

  function generateTickerItem() {
    // Anonymized ticker - no fake names or companies
    const type = Math.random() > 0.5 ? 'action' : 'team';
    let text;

    if (type === 'action') {
      const action = random(CONFIG.actions);
      text = `<strong>${action.text}</strong>`;
    } else {
      const team = random(CONFIG.teamTypes);
      const time = random(CONFIG.timeSaved);
      text = `<strong>${team}</strong> saved ${time}`;
    }

    return `<div class="sp-ticker-item"><span class="sp-ticker-dot"></span>${text}</div>`;
  }

  // ============================================================================
  // NOTIFICATION TOASTS
  // ============================================================================

  let toastContainer = null;
  let activeToasts = 0;
  const maxToasts = 3;

  function createToastContainer() {
    const container = document.createElement('div');
    container.className = 'sp-toast-container';
    document.body.appendChild(container);
    return container;
  }

  function showToast() {
    if (!toastContainer) {
      toastContainer = createToastContainer();
    }

    if (activeToasts >= maxToasts) return;

    const type = Math.random();
    let content;
    let icon;

    if (type < 0.5) {
      // Document generated - anonymized
      const output = random(CONFIG.outputs);
      content = `Just created: ${output}`;
      icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>`;
    } else {
      // Action completed - no fake names
      const action = random(CONFIG.actions);
      content = action.text;
      icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20,6 9,17 4,12"/>
      </svg>`;
    }

    const toast = document.createElement('div');
    toast.className = 'sp-toast';
    toast.innerHTML = `
      <div class="sp-toast-icon">${icon}</div>
      <div class="sp-toast-content">${content}</div>
      <button class="sp-toast-close" aria-label="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    const closeBtn = toast.querySelector('.sp-toast-close');
    closeBtn.addEventListener('click', () => dismissToast(toast));

    toastContainer.appendChild(toast);
    activeToasts++;

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('sp-toast-visible');
    });

    // Auto dismiss after 5 seconds
    setTimeout(() => dismissToast(toast), 5000);

    // Schedule next toast
    scheduleToast();
  }

  function dismissToast(toast) {
    if (!toast.parentNode) return;

    toast.classList.remove('sp-toast-visible');
    toast.classList.add('sp-toast-hiding');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
        activeToasts--;
      }
    }, 300);
  }

  function scheduleToast() {
    const delay = randomBetween(CONFIG.toastInterval.min, CONFIG.toastInterval.max);
    setTimeout(showToast, delay);
  }

  // ============================================================================
  // LOGO WALL
  // ============================================================================

  function createLogoWall() {
    const container = document.createElement('div');
    container.className = 'sp-logo-wall';

    // Changed from fake company names to industry categories
    container.innerHTML = `
      <div class="sp-logo-header">Trusted across industries</div>
      <div class="sp-logo-track-wrapper">
        <div class="sp-logo-track">
          ${CONFIG.industries.map(industry => `
            <div class="sp-logo-item">
              <div class="sp-logo-placeholder">${industry}</div>
            </div>
          `).join('')}
          ${CONFIG.industries.map(industry => `
            <div class="sp-logo-item">
              <div class="sp-logo-placeholder">${industry}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return container;
  }

  // ============================================================================
  // LIVE OUTPUT FEED
  // ============================================================================

  function createOutputFeed() {
    const container = document.createElement('div');
    container.className = 'sp-output-feed morphic-panel';

    const items = [];
    for (let i = 0; i < 4; i++) {
      items.push(generateOutputItem());
    }

    container.innerHTML = `
      <div class="sp-output-header">
        <span class="sp-output-live-dot"></span>
        Live Output Feed
      </div>
      <div class="sp-output-list">
        ${items.join('')}
      </div>
    `;

    // Periodically update feed
    setInterval(() => {
      const list = container.querySelector('.sp-output-list');
      const firstItem = list.querySelector('.sp-output-item');

      if (firstItem) {
        firstItem.classList.add('sp-output-item-leaving');

        setTimeout(() => {
          firstItem.remove();

          const newItem = document.createElement('div');
          newItem.className = 'sp-output-item sp-output-item-entering';
          newItem.innerHTML = generateOutputItemContent();
          list.appendChild(newItem);

          requestAnimationFrame(() => {
            newItem.classList.remove('sp-output-item-entering');
          });
        }, 300);
      }
    }, 8000);

    return container;
  }

  function generateOutputItem() {
    return `<div class="sp-output-item">${generateOutputItemContent()}</div>`;
  }

  function generateOutputItemContent() {
    const output = random(CONFIG.outputs);
    const time = randomBetween(1, 59);

    return `
      <div class="sp-output-preview">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
      </div>
      <div class="sp-output-info">
        <div class="sp-output-title">Just created: ${output}</div>
        <div class="sp-output-time">${time}s ago</div>
      </div>
    `;
  }

  // ============================================================================
  // STATS SECTION
  // ============================================================================

  function createStatsSection() {
    const container = document.createElement('div');
    container.className = 'sp-stats-section';

    // Changed from specific fake numbers to vague but credible claims
    container.innerHTML = `
      <div class="sp-stats-grid">
        <div class="sp-stat-item">
          <div class="sp-stat-value-text">Thousands</div>
          <div class="sp-stat-label">Documents generated daily</div>
        </div>
        <div class="sp-stat-item">
          <div class="sp-stat-value-text">Growing</div>
          <div class="sp-stat-label">Community of teams</div>
        </div>
        <div class="sp-stat-item">
          <div class="sp-stat-value-text">Hours</div>
          <div class="sp-stat-label">Saved per project</div>
        </div>
      </div>
    `;

    return container;
  }

  function animateStats(container) {
    container.querySelectorAll('.sp-stat-value').forEach(el => {
      const target = parseFloat(el.dataset.target);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';

      const isDecimal = target < 100;

      animateCounter(el, 0, target, CONFIG.counterDuration, (n) => {
        if (isDecimal) {
          return prefix + n.toFixed(1) + suffix;
        }
        return prefix + formatNumber(n) + suffix;
      });
    });
  }

  // ============================================================================
  // TRUST INDICATORS
  // ============================================================================

  function createTrustIndicators() {
    const container = document.createElement('div');
    container.className = 'sp-trust-indicators';

    // Changed from specific fake metrics to credible general claims
    container.innerHTML = `
      <div class="sp-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
        <span><strong>Fast</strong> response times</span>
      </div>
      <div class="sp-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22,4 12,14.01 9,11.01"/>
        </svg>
        <span><strong>Enterprise</strong> uptime</span>
      </div>
      <div class="sp-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
        </svg>
        <span><strong>Loved</strong> by teams</span>
      </div>
    `;

    return container;
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  function injectStyles() {
    const styles = document.createElement('style');
    styles.textContent = `
      /* ============================================================================
         SOCIAL PROOF - Ultra Agent V4.0 Theme
         ============================================================================ */

      /* Live User Counter */
      .sp-user-counter {
        display: flex;
        justify-content: center;
        padding: 16px 24px;
        margin: 24px auto;
        max-width: 600px;
      }

      .sp-user-counter-inner {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 24px;
        background: rgba(12, 10, 8, 0.95);
        border: 1px solid rgba(217, 160, 122, 0.3);
        border-radius: 50px;
        backdrop-filter: blur(20px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sp-user-counter.sp-new-user .sp-user-counter-inner {
        border-color: rgba(217, 160, 122, 0.6);
        box-shadow: 0 0 30px rgba(217, 160, 122, 0.3);
      }

      .sp-pulse {
        width: 10px;
        height: 10px;
        background: #7dd3a0;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(125, 211, 160, 0.5);
        animation: sp-pulse 2s ease-in-out infinite;
      }

      @keyframes sp-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.7; }
      }

      .sp-user-count {
        font-family: 'JetBrains Mono', monospace;
        font-size: 18px;
        font-weight: 600;
        color: #ecd4c0;
        text-shadow: 0 0 20px rgba(217, 160, 122, 0.4);
      }

      .sp-user-text {
        font-size: 14px;
        color: #a89080;
      }

      /* Activity Ticker */
      .sp-activity-ticker {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        background: linear-gradient(180deg, transparent, rgba(0,0,0,0.95));
        padding: 16px 0 12px;
        overflow: hidden;
      }

      .sp-ticker-track {
        display: flex;
        gap: 40px;
        animation: sp-ticker-scroll 60s linear infinite;
        white-space: nowrap;
      }

      @keyframes sp-ticker-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }

      .sp-ticker-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #a89080;
        flex-shrink: 0;
      }

      .sp-ticker-item strong {
        color: #ecd4c0;
        font-weight: 500;
      }

      .sp-ticker-dot {
        width: 6px;
        height: 6px;
        background: #7dd3a0;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(125, 211, 160, 0.5);
      }

      /* Toast Notifications */
      .sp-toast-container {
        position: fixed;
        bottom: 60px;
        right: 24px;
        z-index: 1001;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 340px;
      }

      .sp-toast {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        background: rgba(12, 10, 8, 0.98);
        border: 1px solid rgba(217, 160, 122, 0.3);
        border-radius: 12px;
        backdrop-filter: blur(20px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        transform: translateX(120%);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sp-toast-visible {
        transform: translateX(0);
        opacity: 1;
      }

      .sp-toast-hiding {
        transform: translateX(120%);
        opacity: 0;
      }

      .sp-toast-icon {
        width: 32px;
        height: 32px;
        background: rgba(217, 160, 122, 0.15);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .sp-toast-icon svg {
        width: 16px;
        height: 16px;
        stroke: #d9a07a;
      }

      .sp-toast-content {
        flex: 1;
        font-size: 13px;
        color: #e8d5c4;
        line-height: 1.4;
      }

      .sp-toast-close {
        width: 24px;
        height: 24px;
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.5;
        transition: opacity 0.2s;
        flex-shrink: 0;
      }

      .sp-toast-close:hover {
        opacity: 1;
      }

      .sp-toast-close svg {
        width: 14px;
        height: 14px;
        stroke: #a89080;
      }

      /* Logo Wall */
      .sp-logo-wall {
        padding: 60px 24px;
        text-align: center;
        overflow: hidden;
      }

      .sp-logo-header {
        font-size: 14px;
        font-weight: 500;
        color: #6b5a4a;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 32px;
      }

      .sp-logo-track-wrapper {
        position: relative;
        overflow: hidden;
        mask-image: linear-gradient(90deg, transparent, black 10%, black 90%, transparent);
        -webkit-mask-image: linear-gradient(90deg, transparent, black 10%, black 90%, transparent);
      }

      .sp-logo-track {
        display: flex;
        gap: 48px;
        animation: sp-logo-scroll 30s linear infinite;
      }

      @keyframes sp-logo-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }

      .sp-logo-item {
        flex-shrink: 0;
      }

      .sp-logo-placeholder {
        padding: 16px 32px;
        font-family: 'Inter', sans-serif;
        font-size: 16px;
        font-weight: 700;
        color: #4a3f35;
        letter-spacing: 0.5px;
        filter: grayscale(100%);
        opacity: 0.5;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sp-logo-item:hover .sp-logo-placeholder {
        filter: grayscale(0%);
        opacity: 1;
        color: #d9a07a;
      }

      /* Live Output Feed */
      .sp-output-feed {
        position: fixed;
        bottom: 80px;
        left: 24px;
        width: 280px;
        padding: 16px;
        z-index: 100;
      }

      .sp-output-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        color: #a89080;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(217, 160, 122, 0.15);
      }

      .sp-output-live-dot {
        width: 8px;
        height: 8px;
        background: #7dd3a0;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(125, 211, 160, 0.5);
        animation: sp-pulse 2s ease-in-out infinite;
      }

      .sp-output-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .sp-output-item {
        display: flex;
        gap: 12px;
        padding: 10px;
        background: rgba(18, 14, 12, 0.5);
        border-radius: 8px;
        border: 1px solid rgba(217, 160, 122, 0.1);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sp-output-item-leaving {
        opacity: 0;
        transform: translateX(-20px);
      }

      .sp-output-item-entering {
        opacity: 0;
        transform: translateX(20px);
      }

      .sp-output-preview {
        width: 36px;
        height: 36px;
        background: rgba(217, 160, 122, 0.1);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .sp-output-preview svg {
        width: 18px;
        height: 18px;
        stroke: #d9a07a;
      }

      .sp-output-info {
        flex: 1;
        min-width: 0;
      }

      .sp-output-title {
        font-size: 12px;
        color: #e8d5c4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
      }

      .sp-output-time {
        font-size: 11px;
        color: #6b5a4a;
      }

      /* Stats Section */
      .sp-stats-section {
        padding: 80px 24px;
        background: linear-gradient(180deg, transparent 0%, rgba(217, 160, 122, 0.03) 50%, transparent 100%);
      }

      .sp-stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 32px;
        max-width: 900px;
        margin: 0 auto;
        text-align: center;
      }

      .sp-stat-item {
        padding: 32px 24px;
        background: rgba(12, 10, 8, 0.8);
        border: 1px solid rgba(217, 160, 122, 0.2);
        border-radius: 16px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sp-stat-item:hover {
        border-color: rgba(217, 160, 122, 0.4);
        box-shadow: 0 8px 32px rgba(217, 160, 122, 0.1);
        transform: translateY(-4px);
      }

      .sp-stat-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 36px;
        font-weight: 600;
        color: #ecd4c0;
        text-shadow: 0 0 30px rgba(217, 160, 122, 0.4);
        margin-bottom: 8px;
      }

      .sp-stat-value-text {
        font-family: 'Inter', sans-serif;
        font-size: 28px;
        font-weight: 600;
        color: #ecd4c0;
        text-shadow: 0 0 30px rgba(217, 160, 122, 0.4);
        margin-bottom: 8px;
      }

      .sp-stat-label {
        font-size: 14px;
        color: #a89080;
      }

      /* Trust Indicators */
      .sp-trust-indicators {
        display: flex;
        justify-content: center;
        gap: 32px;
        padding: 16px 24px;
        flex-wrap: wrap;
      }

      .sp-trust-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #a89080;
      }

      .sp-trust-item strong {
        color: #d9a07a;
        font-weight: 600;
      }

      .sp-trust-item svg {
        width: 16px;
        height: 16px;
        stroke: #7dd3a0;
      }

      /* Responsive */
      @media (max-width: 900px) {
        .sp-output-feed {
          display: none;
        }

        .sp-stats-grid {
          grid-template-columns: 1fr;
          gap: 16px;
        }

        .sp-trust-indicators {
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .sp-toast-container {
          left: 16px;
          right: 16px;
          max-width: none;
        }
      }

      @media (max-width: 600px) {
        .sp-user-counter-inner {
          flex-direction: column;
          text-align: center;
          gap: 8px;
        }

        .sp-user-text {
          font-size: 12px;
        }

        .sp-logo-placeholder {
          font-size: 14px;
          padding: 12px 24px;
        }

        .sp-stat-value {
          font-size: 28px;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    // Inject styles first
    injectStyles();

    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupElements);
    } else {
      setupElements();
    }
  }

  function setupElements() {
    // Find hero section to insert user counter after
    const heroSection = document.querySelector('.hero');
    if (heroSection) {
      const userCounter = createUserCounter();
      heroSection.insertAdjacentElement('afterend', userCounter);

      // Add trust indicators after user counter
      const trustIndicators = createTrustIndicators();
      userCounter.insertAdjacentElement('afterend', trustIndicators);
    }

    // Find a good spot for logo wall (after demo or preview section)
    const demoSection = document.querySelector('.demo-section');
    if (demoSection) {
      const logoWall = createLogoWall();
      demoSection.insertAdjacentElement('afterend', logoWall);
    }

    // Find spot for stats section (before testimonials or pricing)
    const testimonialsSection = document.querySelector('.testimonials-section');
    if (testimonialsSection) {
      const statsSection = createStatsSection();
      testimonialsSection.insertAdjacentElement('beforebegin', statsSection);
    }

    // Add activity ticker (bottom of page)
    const activityTicker = createActivityTicker();
    document.body.appendChild(activityTicker);

    // Add output feed (fixed position)
    const outputFeed = createOutputFeed();
    document.body.appendChild(outputFeed);

    // Start toast notifications after a delay
    setTimeout(showToast, 5000);

    console.log('[Alabobai] Social Proof System initialized');
  }

  // Start initialization
  init();

})();
