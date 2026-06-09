/**
 * dialogs.js — Custom dialog system (alert / confirm / prompt)
 * No circular dependencies — imported by any module that needs dialogs.
 */

import { S } from './state.js';

/**
 * Core dialog engine. Returns a Promise resolving with the user's choice.
 * @param {'alert'|'confirm'|'prompt'} type
 * @param {string} title
 * @param {string} msg   (HTML allowed)
 * @param {object} opts  { defaultVal, okText, cancelText, extraText, datalistOptions }
 */
export function showCustomDialog(type, title, msg, opts = {}) {
  const {
    defaultVal = '',
    okText = 'OK',
    cancelText = 'Cancel',
    extraText = null,
    datalistOptions = null,
  } = opts;

  return new Promise(resolve => {
    const overlay   = document.getElementById('dialog-overlay');
    const titleEl   = document.getElementById('dialog-title');
    const msgEl     = document.getElementById('dialog-msg');
    const inputEl   = document.getElementById('dialog-input');
    const datalistEl= document.getElementById('dialog-datalist');
    const btnCancel = document.getElementById('dialog-btn-cancel');
    const btnOk     = document.getElementById('dialog-btn-ok');
    const btnExtra  = document.getElementById('dialog-btn-extra');

    titleEl.innerText = title;
    msgEl.innerHTML   = msg;
    inputEl.value     = defaultVal;
    btnOk.innerText   = okText;
    btnCancel.innerText = cancelText;

    // Datalist
    datalistEl.innerHTML = (datalistOptions || [])
      .map(o => `<option value="${o}"></option>`).join('');

    // Extra button
    if (extraText) {
      btnExtra.style.display = 'block';
      btnExtra.innerText = extraText;
    } else {
      btnExtra.style.display = 'none';
    }

    // Show / hide fields per type
    if (type === 'prompt') {
      inputEl.style.display  = 'block';
      btnCancel.style.display= 'block';
    } else if (type === 'confirm') {
      inputEl.style.display  = 'none';
      btnCancel.style.display= 'block';
    } else { // alert
      inputEl.style.display  = 'none';
      btnCancel.style.display= 'none';
    }

    overlay.style.display = 'flex';
    setTimeout(() => {
      overlay.classList.add('open');
      if (type === 'prompt') inputEl.focus();
    }, 10);

    const cleanup = () => {
      overlay.classList.remove('open');
      setTimeout(() => (overlay.style.display = 'none'), 200);
      btnOk.onclick      = null;
      btnCancel.onclick  = null;
      if (btnExtra) btnExtra.onclick = null;
      inputEl.onkeydown  = null;
    };

    btnOk.onclick     = () => { cleanup(); resolve(type === 'prompt' ? inputEl.value : true); };
    btnCancel.onclick = () => { cleanup(); resolve(type === 'prompt' ? null : false); };
    if (btnExtra) {
      btnExtra.onclick = () => { cleanup(); resolve('extra'); };
    }

    inputEl.onkeydown = e => {
      if (e.key === 'Enter')  btnOk.click();
      if (e.key === 'Escape') btnCancel.click();
    };
  });
}

export const customAlert   = (msg, title = 'Alert')   => showCustomDialog('alert',   title, msg);
export const customConfirm = (msg, title = 'Confirm') => showCustomDialog('confirm', title, msg);
export const customPrompt  = (msg, defaultVal = '', title = 'Input', options = null) =>
  showCustomDialog('prompt', title, msg, { defaultVal, datalistOptions: options });
