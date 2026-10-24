// Pembantu UI tanpa dependensi. Semua teks disisipkan lewat textContent (aman dari XSS).
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5V14h4v5.5h4.5V10',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM20 19v-1.4a3.2 3.2 0 0 0-2.4-3.1M15.5 4.8a3.2 3.2 0 0 1 0 6.2',
  alert: 'M12 3.5 2.8 19.5h18.4L12 3.5ZM12 10v4.5M12 17.2v.1',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  book: 'M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5ZM5 17a3 3 0 0 1 3-3h10',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z',
  shield: 'M12 3 4.5 6v5.5c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5V6L12 3ZM9 12l2.2 2.2L15.5 10',
  cog: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 13.5l1.5 1.2-1.6 2.8-1.8-.6a7 7 0 0 1-1.6.9L15.5 19h-3.2l-.4-1.7a7 7 0 0 1-1.6-.9l-1.8.6-1.6-2.8 1.4-1.2a7 7 0 0 1 0-1.8L6.9 10.8l1.6-2.8 1.8.6a7 7 0 0 1 1.6-.9L12.3 6h3.2l.4 1.7c.6.2 1.1.5 1.6.9l1.8-.6 1.6 2.8-1.5 1.2c.1.6.1 1.2 0 1.5Z',
  logout: 'M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9M16 8l4 4-4 4M20 12H9',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  x: 'M6 6l12 12M18 6 6 18',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z',
  eyeoff: 'M3 3l18 18M10.6 6a9 9 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a16 16 0 0 1-3 3.6M6.3 7.5A15.7 15.7 0 0 0 2.5 12S6 18.1 12 18.1c1.6 0 3-.4 4.2-1M9.9 9.9a2.8 2.8 0 0 0 3.9 3.9',
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
  key: 'M14.5 9.5a4 4 0 1 1-1.2 2.9L4 21.5v-3h3v-2.5h2.5L12 13.5a4 4 0 0 1 2.5-4ZM16.5 8.5h.01',
  print: 'M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7v-6Z',
  download: 'M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14',
  check: 'M5 12.5 10 17.5 19 7',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  grid: 'M4 4h6.5v6.5H4V4ZM13.5 4H20v6.5h-6.5V4ZM4 13.5h6.5V20H4v-6.5ZM13.5 13.5H20V20h-6.5v-6.5Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
};

export function icon(name, size = 22) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', ICONS[name] || ICONS.grid); svg.append(p);
  return svg;
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  if (value !== undefined) el.value = value;
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...kids) => { clear(el); for (const k of kids.flat(Infinity)) if (k) el.append(k.nodeType ? k : document.createTextNode(String(k))); return el; };
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- format ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function fmtDate(d) {
  if (!d) return '-';
  const s = String(d).slice(0, 10); const [y, m, day] = s.split('-').map(Number);
  if (!y) return '-'; return `${day} ${MONTHS[m - 1]} ${y}`;
}
export function fmtDateTime(ts) {
  if (!ts) return '-';
  const dt = new Date(ts); if (isNaN(dt)) return '-';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(dt).reduce((a, p) => (a[p.type] = p.value, a), {});
  return `${+parts.day} ${MONTHS[+parts.month - 1]} ${parts.year}, ${parts.hour}.${parts.minute} WIB`;
}
export function todayWIB() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
}
export const num = (n) => new Intl.NumberFormat('id-ID').format(n ?? 0);

// ---------- toast ----------
let toastBox;
export function toast(message, kind = 'ok', ms = 3800) {
  if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const t = h('div', { class: 'toast ' + kind }, message);
  toastBox.append(t); setTimeout(() => t.remove(), ms);
}

// ---------- modal ----------
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const prevFocus = document.activeElement;
  const overlay = h('div', { class: 'overlay', role: 'presentation' });
  const closeBtn = h('button', { class: 'icon-btn dark', type: 'button', 'aria-label': 'Tutup', onclick: () => close() }, icon('x'));
  const footer = actions.length ? h('footer', null, actions) : null;
  const dialog = h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', null, h('h2', null, title), closeBtn),
    h('div', { class: 'body' }, body), footer);
  overlay.append(dialog);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.body.append(overlay); document.body.style.overflow = 'hidden';
  const first = dialog.querySelector('input:not([readonly]),select,textarea,button.btn');
  if (first) setTimeout(() => first.focus(), 30);
  function close() {
    document.removeEventListener('keydown', onKey); overlay.remove();
    if (!document.querySelector('.overlay')) document.body.style.overflow = '';
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  }
  return { close, el: dialog, setBody(...k) { mount(dialog.querySelector('.body'), ...k); }, setFooter(...k) { let f = dialog.querySelector('footer'); if (!f) { f = h('footer'); dialog.append(f); } mount(f, ...k); } };
}

export function confirmDialog({ title, message, confirmText = 'Ya, lanjutkan', danger = false, reason = null }) {
  return new Promise((resolve) => {
    let done = false; let area;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const err = h('div', { class: 'err', role: 'alert' });
    const body = [h('p', null, message)];
    if (reason) { area = h('textarea', { class: 'input', rows: 3, placeholder: reason.placeholder || '', 'aria-label': reason.label }); body.push(field(reason.label, area, reason.hint), err); }
    const ok = h('button', { class: 'btn' + (danger ? ' danger' : ''), type: 'button', onclick: () => {
      if (reason) { const v = area.value.trim(); if (v.length < (reason.min || 5)) { err.textContent = `${reason.label} minimal ${reason.min || 5} karakter.`; area.focus(); return; } finish(v); } else finish(true);
    } }, confirmText);
    const m = modal({ title, body, actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(null) }, 'Batal'), ok], onClose: () => { if (!done) { done = true; resolve(null); } } });
  });
}

export function field(label, control, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  if (control.tagName) { control.id = control.id || id; }
  return h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

// tombol dengan status "sedang diproses" (cegah klik ganda)
export async function withBusy(btn, fn) {
  if (btn.disabled) return;
  const label = btn.textContent; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Memproses…';
  try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = label; }
}

export const skeletons = (n = 3) => h('div', { class: 'list', 'aria-busy': 'true', 'aria-label': 'Memuat' }, Array.from({ length: n }, () => h('div', { class: 'skeleton' })));
export const emptyState = (msg, sub) => h('div', { class: 'empty' }, h('div', { class: 'big', 'aria-hidden': 'true' }, '🌿'), h('div', null, msg), sub ? h('div', { class: 'small' }, sub) : null);

export function badge(text, cls = '') { return h('span', { class: 'badge ' + cls }, text); }

export function csvDownload(filename, rows) {
  const esc = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: filename });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
