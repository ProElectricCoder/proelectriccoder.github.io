/**
 * DeepBlue IDE - Onboarding Tour Manager
 * A zero-dependency, lightweight guided tour system.
 */

export class TourManager {
    constructor(options = {}) {
        this.steps = [
            {
                target: null, // null means center screen
                title: "Welcome to DeepBlue 🌊",
                message: "DeepBlue is your ultimate browser-based development workspace. Write code, execute native Python, chat with AI, and manage encrypted files—all in one place. Let's take a quick tour.",
                placement: "center"
            },
            {
                target: '#sidebar-panel', // Adjust selector if your ID is different
                title: "Your Virtual Workspace",
                message: "This is where your project lives. Create files, organize folders, and import content directly from your computer by dragging and dropping it into the editor.<br><br><span style='color: var(--accent); font-size: 0.85rem;'>💡 <b>Pro-Tip:</b> Right-click a file for actions like rename, delete, and Encrypt (using Zero-Knowledge cryptography).</span>",
                placement: "right"
            },
            {
                target: '#editor-panel',
                title: "The Command Center",
                message: "This is where you write and edit code. DeepBlue supports multi-tab editing, syntax highlighting, and formatting tools. Try pressing <code>Ctrl+Space</code> while typing for smart suggestions, or <code>Ctrl+F</code> to search.",
                placement: "bottom"
            },
            {
                target: '.header-actions, .actions', // Targets the wrapper containing Run, Save, Format
                title: "Build Faster",
                message: "Use Run to preview your work, Save to securely store your project, and Format to clean up code instantly. DeepBlue natively renders Web apps and spins up a local execution server for <code>.py</code> files!",
                placement: "bottom"
            },
            {
                target: '#output-container',
                title: "Live Preview & Debugging",
                message: "See your app in real-time in the preview area. Use the device controls above to test different screen sizes, and check the Console below for logs, errors, and quick JavaScript input.",
                placement: "left"
            },
            {
                target: '#ai-assist-btn, .ai-btn', 
                title: "Your Coding Co-Pilot",
                message: "Open Gemini AI for help with bugs, explanations, and code generation. It automatically uses your currently active file as context so the suggestions stay highly relevant.",
                placement: "bottom"
            },
            {
                target: '#github-connect-btn, .github-btn-group',
                title: "Connect and Ship",
                message: "Link your GitHub account to import repositories and commit changes directly from DeepBlue. It is the fastest path from editing to publishing.",
                placement: "bottom"
            },
            {
                target: null,
                title: "You Are All Set 🚀",
                message: "Open <code>index.html</code>, create a new file, or import a project to begin. DeepBlue is ready when you are.",
                placement: "center"
            }
        ];
        
        this.currentStep = 0;
        this.isActive = false;
        
        // DOM Elements
        this.overlay = null;
        this.spotlight = null;
        this.tooltip = null;
        
        this.resizeHandler = this.updatePositions.bind(this);
    }

    init() {
        this.injectStyles();
        
        // Auto-start if never completed
        const isCompleted = localStorage.getItem('deepBlue_tour_completed');
        if (!isCompleted) {
            // Slight delay to ensure IDE has fully rendered before calculating positions
            setTimeout(() => this.start(), 1000);
        }
    }

    injectStyles() {
        if (document.getElementById('deepblue-tour-styles')) return;
        const style = document.createElement('style');
        style.id = 'deepblue-tour-styles';
        style.innerHTML = `
            .db-tour-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                z-index: 9998; pointer-events: auto; /* Blocks clicks to UI below */
                transition: opacity 0.3s ease; opacity: 0;
            }
            .db-tour-spotlight {
                position: absolute;
                border-radius: var(--radius-md, 8px);
                /* Using 100vmax ensures it covers the screen without breaking GPU texture limits */
                box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.75), 0 0 15px 2px rgba(0, 229, 255, 0.4);
                transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
                pointer-events: none;
                z-index: 9999;
                border: 2px solid var(--accent, #00e5ff);
            }
            .db-tour-tooltip {
                position: absolute;
                width: 320px;
                background: var(--bg-panel, #0a0e14);
                border: 1px solid var(--border, #1e293b);
                border-radius: var(--radius-lg, 12px);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
                color: var(--text-main, #f8fafc);
                padding: 20px;
                z-index: 10000;
                transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
                opacity: 0;
                transform: translateY(10px);
                pointer-events: auto;
            }
            .db-tour-tooltip.visible {
                opacity: 1; transform: translateY(0);
            }
            .db-tour-title { font-size: 1.1rem; font-weight: bold; margin-bottom: 10px; color: var(--accent, #00e5ff); }
            .db-tour-message { font-size: 0.9rem; line-height: 1.5; color: var(--text-muted, #94a3b8); margin-bottom: 20px; }
            .db-tour-message code { background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; color: var(--text-main); }
            .db-tour-nav { display: flex; justify-content: space-between; align-items: center; }
            .db-tour-dots { display: flex; gap: 4px; }
            .db-tour-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); opacity: 0.3; transition: 0.2s; }
            .db-tour-dot.active { opacity: 1; background: var(--accent); transform: scale(1.2); }
            .db-tour-buttons { display: flex; gap: 8px; }
            .db-tour-btn { 
                padding: 6px 12px; border-radius: var(--radius-sm, 6px); font-size: 0.85rem; 
                cursor: pointer; border: none; font-weight: 500; transition: 0.2s;
            }
            .db-tour-btn-ghost { background: transparent; color: var(--text-muted); }
            .db-tour-btn-ghost:hover { color: var(--text-main); }
            .db-tour-btn-primary { background: var(--accent, #00e5ff); color: #000; }
            .db-tour-btn-primary:hover { opacity: 0.9; transform: scale(1.05); }
        `;
        document.head.appendChild(style);
    }

    buildDOM() {
        // Build Overlay & Spotlight
        this.overlay = document.createElement('div');
        this.overlay.className = 'db-tour-overlay';
        
        this.spotlight = document.createElement('div');
        this.spotlight.className = 'db-tour-spotlight';
        
        // Build Tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'db-tour-tooltip';
        this.tooltip.innerHTML = `
            <div class="db-tour-title"></div>
            <div class="db-tour-message"></div>
            <div class="db-tour-nav">
                <div class="db-tour-dots"></div>
                <div class="db-tour-buttons">
                    <button class="db-tour-btn db-tour-btn-ghost" id="db-tour-skip">Skip</button>
                    <button class="db-tour-btn db-tour-btn-ghost" id="db-tour-back" style="display:none">Back</button>
                    <button class="db-tour-btn db-tour-btn-primary" id="db-tour-next">Next</button>
                </div>
            </div>
        `;

        this.overlay.appendChild(this.spotlight);
        document.body.appendChild(this.overlay);
        document.body.appendChild(this.tooltip);

        // Bind Events
        document.getElementById('db-tour-skip').onclick = () => this.finish();
        document.getElementById('db-tour-back').onclick = () => this.prev();
        document.getElementById('db-tour-next').onclick = () => this.next();
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.currentStep = 0;
        
        if (!this.overlay) this.buildDOM();
        
        this.overlay.style.display = 'block';
        this.tooltip.style.display = 'block';
        
        // Fade in
        setTimeout(() => {
            this.overlay.style.opacity = '1';
            this.tooltip.classList.add('visible');
        }, 50);

        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('keydown', this.handleKeydown.bind(this));
        
        this.renderStep();
    }

    renderStep() {
        const step = this.steps[this.currentStep];
        if (!step) return;

        // Update Content
        this.tooltip.querySelector('.db-tour-title').innerHTML = step.title;
        this.tooltip.querySelector('.db-tour-message').innerHTML = step.message;
        
        // Update Buttons
        const backBtn = document.getElementById('db-tour-back');
        const nextBtn = document.getElementById('db-tour-next');
        const skipBtn = document.getElementById('db-tour-skip');
        
        backBtn.style.display = this.currentStep === 0 ? 'none' : 'block';
        skipBtn.style.display = this.currentStep === this.steps.length - 1 ? 'none' : 'block';
        
        if (this.currentStep === this.steps.length - 1) {
            nextBtn.innerText = 'Finish Tour';
        } else {
            nextBtn.innerText = 'Next';
        }

        // Update Progress Dots
        const dotsContainer = this.tooltip.querySelector('.db-tour-dots');
        dotsContainer.innerHTML = '';
        this.steps.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = `db-tour-dot ${index === this.currentStep ? 'active' : ''}`;
            dotsContainer.appendChild(dot);
        });

        this.updatePositions();
    }

    updatePositions() {
        const step = this.steps[this.currentStep];
        if (!step) return;

        let targetEl = step.target ? document.querySelector(step.target) : null;
        const padding = 10;

        if (targetEl) {
            // Bring target into view if hidden
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            
            const rect = targetEl.getBoundingClientRect();
            
            // Move Spotlight to surround element
            this.spotlight.style.top = `${rect.top - padding}px`;
            this.spotlight.style.left = `${rect.left - padding}px`;
            this.spotlight.style.width = `${rect.width + (padding * 2)}px`;
            this.spotlight.style.height = `${rect.height + (padding * 2)}px`;
            this.spotlight.style.opacity = '1';

            // Calculate Tooltip Position
            this.positionTooltip(rect, step.placement);
        } else {
            // Center screen placement (for Welcome/Finish steps)
            this.spotlight.style.opacity = '0'; // Hide spotlight hole
            
            this.tooltip.style.top = '50%';
            this.tooltip.style.left = '50%';
            this.tooltip.style.transform = 'translate(-50%, -50%)';
        }
    }

    positionTooltip(targetRect, placement) {
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const offset = 20; // Distance from target
        
        let top, left;

        switch (placement) {
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.right + offset;
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.left - tooltipRect.width - offset;
                break;
            case 'bottom':
                top = targetRect.bottom + offset;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'top':
                top = targetRect.top - tooltipRect.height - offset;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            default:
                // Fallback to center
                top = (window.innerHeight / 2) - (tooltipRect.height / 2);
                left = (window.innerWidth / 2) - (tooltipRect.width / 2);
        }

        // Boundary safety checks (keep on screen)
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - tooltipRect.width - 10;
        if (top < 10) top = 10;
        if (top + tooltipRect.height > window.innerHeight - 10) top = window.innerHeight - tooltipRect.height - 10;

        // Apply without the transform(-50%,-50%) used in the center alignment
        this.tooltip.style.transform = 'none';
        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.renderStep();
        } else {
            this.finish();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.renderStep();
        }
    }

    handleKeydown(e) {
        if (!this.isActive) return;
        if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
        if (e.key === 'ArrowLeft') this.prev();
        if (e.key === 'Escape') this.finish();
    }

    finish() {
        this.isActive = false;
        
        // Mark as completed in local storage
        localStorage.setItem('deepBlue_tour_completed', 'true');
        
        // Fade out
        this.overlay.style.opacity = '0';
        this.tooltip.classList.remove('visible');
        
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.tooltip.style.display = 'none';
            window.removeEventListener('resize', this.resizeHandler);
            window.removeEventListener('keydown', this.handleKeydown);
        }, 400);
    }
}

// Export a default instance for easy integration
export default new TourManager();