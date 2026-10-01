#!/usr/bin/env node
/*
 * handlers.test.mjs — همه‌ی توابع inline (onclick/onchange/…) صفحه‌ی index.html
 * باید پس از بارگذاری ماژول‌ها روی window موجود باشند.
 * این تست از دسته‌ی باگ‌هایی جلوگیری می‌کند که «دکمه‌ها بی‌صدا کار نمی‌کنند»
 * (تابع در ماژول تعریف شده اما export نشده است).
 *
 * اجرا: node tools/.media-e2e/handlers.test.mjs
 */
import fs from 'fs';
import path from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = process.env.EPLAK_ROOT || '/home/user/eplak-fixed';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* نام توابعی که در attributeهای inline صدا زده می‌شوند */
const handlerNames = new Set();
for (const m of html.matchAll(/\son(?:click|change|input|submit|load|error|toggle)\s*=\s*"([^"]*)"/g)) {
  for (const call of m[1].matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = call[2];
    if (['if', 'return', 'else', 'this', 'event', 'window', 'document', 'function', 'typeof', 'alert', 'confirm', 'parseInt', 'String', 'Number', 'Math'].includes(name)) continue;
    handlerNames.add(name);
  }
}

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});
virtualConsole.on('error', () => {});

const dom = new JSDOM(html, { url: 'https://eplak.test/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
const { window } = dom;
window.fetch = () => Promise.resolve({ ok: false, status: 0, json: () => Promise.resolve({}) });
window.open = () => null;

const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
const failedScripts = [];
for (const src of scripts) {
  if (/^https?:|^\/\//.test(src)) continue;                       // منابع بیرونی
  const filePath = path.join(ROOT, src.split('?')[0]);
  if (!fs.existsSync(filePath)) { failedScripts.push(`${src} (فایل نیست)`); continue; }
  try {
    const el = window.document.createElement('script');
    el.textContent = fs.readFileSync(filePath, 'utf8');
    window.document.body.appendChild(el);
  } catch (error) {
    failedScripts.push(`${src} → ${error.message}`);
  }
}
await new Promise((r) => setTimeout(r, 400));

const missing = [];
for (const name of [...handlerNames].sort()) {
  let type = 'undefined';
  try { type = typeof window[name]; } catch (e) { type = 'error'; }
  if (type !== 'function') missing.push(`${name} (${type})`);
}

console.log(`▶ کنترل توابع inline — ${handlerNames.size} تابع در index.html`);
if (failedScripts.length) {
  console.log('⚠️ اسکریپت‌هایی که در jsdom بارگذاری نشدند:');
  failedScripts.forEach((s) => console.log('   - ' + s));
}
if (missing.length) {
  console.log(`❌ توابعی که روی window نیستند (${missing.length}):`);
  missing.forEach((m) => console.log('   - ' + m));
  process.exit(1);
}
console.log('✅ همه‌ی توابع inline روی window موجودند');
process.exit(0);
