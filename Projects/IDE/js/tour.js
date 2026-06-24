/**
 * tour.js — Onboarding tour for DeepBlue IDE.
 * CSS lives in css/tour.css — no inline style injection here.
 * Steps are configurable via the constructor's `steps` option.
 */

const DEFAULT_STEPS = [
  {
    target: null,
    title: 'Welcome to DeepBlue 🌊',
    message: 'DeepBlue is your ultimate browser-based development workspace. Write code, run Python natively, chat with AI, and manage encrypted files — all in one place. Let\'s take a quick tour.',
    placement: 'center',
  },
  {
    target: ['#sidebar-panel', '.sidebar'],
    title: 'Your Virtual Workspace',
    message: 'This is where your project lives. Create files, organise folders, and drag-and-drop files straight into the editor.<br><br><span style="color:var(--accent);font-size:.85rem">💡 Right-click any file for rename, delete, and zero-knowledge Encrypt.</span>',
    placement: 'right',
  },
  {
    target: ['#editor-panel', '.editor-wrapper', '.cm-editor'],
    title: 'The Command Centre',
    message: 'Write and edit code here with syntax highlighting, auto-complete, and code folding. Press <code>Ctrl+Space</code> for suggestions, <code>Ctrl+F</code> to search.',
    placement: 'bottom',
  },
  {
    target: ['[onclick*="runCode"]', '#save-btn', 'div[data-path$=".py"]'],
    title: 'Build Faster',
    message: 'Hit <strong>Run</strong> to preview your work instantly. <strong>Save</strong> stores your project locally or to disk. DeepBlue renders web apps live and executes <code>.py</code> files via a local server.',
    placement: 'bottom',
  },
  {
    target: ['#output-container', '.output-container'],
    title: 'Live Preview & Debugging',
    message: 'See your app in real-time. Use the device controls above to test responsiveness, check the Console tabs below for logs (a System tab plus one per open file), and run JavaScript directly in the REPL.',
    placement: 'left',
  },
  {
    target: ['[onclick*="toggleAI"]', '[onclick*="AI"]'],
    title: 'Your Coding Co-Pilot',
    message: 'Open the Gemini AI assistant for help with bugs, explanations, and code generation. It automatically reads your active file as context. Use <code>@filename</code> to include other files.',
    placement: 'bottom',
  },
  {
    target: ['#github-btn'],
    title: 'Connect and Ship',
    message: 'Click the GitHub icon to connect your account, import a repository, or commit changes — all from one dropdown. The fastest path from editing to publishing.',
    placement: 'bottom',
  },
  {
    target: null,
    title: 'You\'re All Set 🚀',
    message: 'Open <code>DeepBlue/index.html</code>, create a new file, or import a GitHub project to begin. DeepBlue is ready when you are.',
    placement: 'center',
  },
];

export class TourManager {
  /**
   * @param {object} options
   * @param {Array}  options.steps       — Override default steps
   * @param {string} options.storageKey  — localStorage key for completion flag
   */
  constructor(options = {}) {
    this.steps      = options.steps      ?? DEFAULT_STEPS;
    this.storageKey = options.storageKey ?? 'deepBlue_tour_completed';
    this.current    = 0;
    this.active     = false;

    this.overlay    = null;
    this.spotlight  = null;
    this.tooltip    = null;

    this._onResize  = this._updatePositions.bind(this);
    this._onKeydown = this._handleKeydown.bind(this);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  init() {
    if (!localStorage.getItem(this.storageKey)) {
      setTimeout(() => this.start(), 1200);
    }
  }

  start() {
    if (this.active) return;
    this.active  = true;
    this.current = 0;
    this._buildDOM();
    this.overlay.style.display  = 'block';
    this.tooltip.style.display  = 'block';
    setTimeout(() => {
      this.overlay.style.opacity = '1';
      this.tooltip.classList.add('visible');
    }, 40);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKeydown);
    this._renderStep();
  }

  finish() {
    this.active = false;
    localStorage.setItem(this.storageKey, 'true');
    if (this.overlay)  this.overlay.style.opacity = '0';
    if (this.tooltip)  this.tooltip.classList.remove('visible');
    setTimeout(() => {
      if (this.overlay) this.overlay.style.display = 'none';
      if (this.tooltip) this.tooltip.style.display = 'none';
    }, 400);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeydown);
  }

  next() { this.current < this.steps.length - 1 ? (this.current++, this._renderStep()) : this.finish(); }
  prev() { if (this.current > 0) { this.current--; this._renderStep(); } }

  // ─── Private: DOM building ───────────────────────────────────────────────────

  _buildDOM() {
    if (this.overlay) return; // already built

    this.overlay = document.createElement('div');
    this.overlay.className = 'db-tour-overlay';

    this.spotlight = document.createElement('div');
    this.spotlight.className = 'db-tour-spotlight';
    this.overlay.appendChild(this.spotlight);
    document.body.appendChild(this.overlay);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'db-tour-tooltip';
    this.tooltip.innerHTML = `
      <div class="db-tour-title"></div>
      <div class="db-tour-message"></div>
      <div class="db-tour-nav">
        <div class="db-tour-dots"></div>
        <div class="db-tour-buttons">
          <button class="db-tour-btn db-tour-btn-ghost" id="db-skip">Skip</button>
          <button class="db-tour-btn db-tour-btn-ghost" id="db-back" style="display:none">Back</button>
          <button class="db-tour-btn db-tour-btn-primary" id="db-next">Next</button>
        </div>
      </div>`;
    document.body.appendChild(this.tooltip);

    document.getElementById('db-skip').onclick = () => this.finish();
    document.getElementById('db-back').onclick = () => this.prev();
    document.getElementById('db-next').onclick = () => this.next();
  }

  // ─── Private: step rendering ─────────────────────────────────────────────────

  _renderStep() {
    const step = this.steps[this.current];
    if (!step) return;

    this.tooltip.querySelector('.db-tour-title').innerHTML   = step.title;
    this.tooltip.querySelector('.db-tour-message').innerHTML = step.message;

    const isLast = this.current === this.steps.length - 1;
    document.getElementById('db-back').style.display  = this.current === 0 ? 'none' : 'block';
    document.getElementById('db-skip').style.display  = isLast             ? 'none' : 'block';
    document.getElementById('db-next').innerText      = isLast ? 'Finish Tour' : 'Next';

    // Progress dots
    const dotsEl = this.tooltip.querySelector('.db-tour-dots');
    dotsEl.innerHTML = '';
    this.steps.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = `db-tour-dot${i === this.current ? ' active' : ''}`;
      dotsEl.appendChild(d);
    });

    this._updatePositions();
  }

  // ─── Private: positioning ────────────────────────────────────────────────────

  _updatePositions() {
    const step = this.steps[this.current];
    if (!step) return;

    let targetEl = null;
    if (step.target) {
      const selectors = Array.isArray(step.target) ? step.target : [step.target];
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.getBoundingClientRect().width > 0) { targetEl = el; break; }
        } catch {}
      }
    }

    const PAD = 10;
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      const r = targetEl.getBoundingClientRect();
      Object.assign(this.spotlight.style, {
        top: `${r.top - PAD}px`, left: `${r.left - PAD}px`,
        width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px`,
        opacity: '1',
      });
      this._positionTooltip(r, step.placement);
    } else {
      this.spotlight.style.opacity = '0';
      this.tooltip.style.cssText  += ';top:50%;left:50%;transform:translate(-50%,-50%)';
    }
  }

  _positionTooltip(rect, placement) {
    const TW  = 320, OFFSET = 20;
    const TH  = this.tooltip.getBoundingClientRect().height || 200;
    let top, left;
    switch (placement) {
      case 'right':  top = rect.top + rect.height / 2 - TH / 2;  left = rect.right  + OFFSET; break;
      case 'left':   top = rect.top + rect.height / 2 - TH / 2;  left = rect.left   - TW - OFFSET; break;
      case 'bottom': top = rect.bottom + OFFSET;                  left = rect.left   + rect.width / 2 - TW / 2; break;
      case 'top':    top = rect.top    - TH  - OFFSET;            left = rect.left   + rect.width / 2 - TW / 2; break;
      default:       top = window.innerHeight / 2 - TH / 2;       left = window.innerWidth  / 2 - TW / 2;
    }
    // Clamp to viewport
    left = Math.max(10, Math.min(left, window.innerWidth  - TW - 10));
    top  = Math.max(10, Math.min(top,  window.innerHeight - TH - 10));
    this.tooltip.style.transform = 'none';
    this.tooltip.style.top  = `${top}px`;
    this.tooltip.style.left = `${left}px`;
  }

  _handleKeydown(e) {
    if (!this.active) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter')  this.next();
    if (e.key === 'ArrowLeft')  this.prev();
    if (e.key === 'Escape')     this.finish();
  }
}

export default new TourManager();