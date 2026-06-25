/**
 * mobile.js — Swipeable 3-panel mobile layout (Files | Editor | Preview)
 * plus a slide-up Console drawer attached to the Preview panel.
 *
 * Panel order/index: 0 = Files (sidebar), 1 = Editor (home/default), 2 = Preview.
 * Swipe left  → index - 1 (toward Files)
 * Swipe right → index + 1 (toward Preview)
 * While on Preview (index 2): swipe down opens the Console sheet, swipe up closes it.
 *
 * Desktop is completely unaffected — everything here is gated behind the
 * same (max-width: 768px) breakpoint used in css/ide.css, and --panel-index
 * is simply ignored by the desktop CSS rules.
 */

import { S } from './state.js';

let panelIndex   = 1;     // 0 files, 1 editor, 2 preview
let consoleOpen  = false;

function _isMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function _applyNavHighlight() {
  document.querySelectorAll('.mobile-nav-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.panel) === panelIndex);
  });
}

export function setPanel(index) {
  panelIndex = Math.max(0, Math.min(2, index));
  document.documentElement.style.setProperty('--panel-index', panelIndex);
  _applyNavHighlight();
  if (panelIndex !== 2) setConsoleOpen(false);
}

export function getPanel() { return panelIndex; }

export function setConsoleOpen(open) {
  consoleOpen = open;
  document.getElementById('web-console')?.classList.toggle('mobile-console-open', open);
}

/** Called after a manual Run on mobile so the result is immediately visible. */
export function showPreviewOnMobile() {
  if (_isMobile()) setPanel(2);
}

export function initMobileGestures() {
  const track = document.getElementById('main-container');
  if (!track) return;

  setPanel(panelIndex);

  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;
  const THRESHOLD = 45;

  track.addEventListener('touchstart', e => {
    if (!_isMobile() || !e.touches.length) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    dx = 0; dy = 0; dragging = true;
  }, { passive: true });

  track.addEventListener('touchmove', e => {
    if (!dragging || !e.touches.length) return;
    dx = e.touches[0].clientX - sx;
    dy = e.touches[0].clientY - sy;
  }, { passive: true });

  track.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    if (!_isMobile()) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -THRESHOLD)      setPanel(panelIndex - 1); // swipe left  → Files
      else if (dx > THRESHOLD)  setPanel(panelIndex + 1); // swipe right → Preview
    } else if (panelIndex === 2) {
      if (dy > THRESHOLD)       setConsoleOpen(true);     // swipe down → open console
      else if (dy < -THRESHOLD) setConsoleOpen(false);    // swipe up   → close console
    }
  });

  // Re-clamp on resize/orientation change so a desktop→mobile resize doesn't
  // leave the carousel mid-transform.
  window.addEventListener('resize', () => setPanel(panelIndex));
}