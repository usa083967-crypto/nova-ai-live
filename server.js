'use strict';
/*
  Nova AI server. Koi npm package nahi chahiye, sirf Node.js 18 ya naya.
  Chalane ke liye: node server.js
*/
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

if (typeof fetch !== 'function') {
  console.error('Node.js 18 ya naya version chahiye. https://nodejs.org se LTS version install karein.');
  process.exit(1);
}

/* ---------- .env ---------- */
(function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').replace(/^﻿/, '');
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue;
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch (e) { /* .env na ho to theek hai */ }
})();

function num(name, dflt) {
  const v = process.env[name];
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

const ENV_ANTHROPIC = (process.env.ANTHROPIC_API_KEY || '').trim();
const ENV_GEMINI = (process.env.GEMINI_API_KEY || '').trim();
const ENV_GENERIC = (process.env.API_KEY || '').trim();
let provider = (process.env.PROVIDER || '').trim().toLowerCase();
if (!provider) provider = ENV_ANTHROPIC ? 'anthropic' : (ENV_GEMINI ? 'gemini' : (ENV_GENERIC ? 'openai' : 'anthropic'));
if (['anthropic', 'gemini', 'openai'].indexOf(provider) < 0) { console.error('PROVIDER ki value anthropic, gemini ya openai honi chahiye.'); process.exit(1); }
const PROVIDERS = {
  anthropic: { key: ENV_ANTHROPIC, base: 'https://api.anthropic.com', models: { fast: 'claude-haiku-5-5', nova: 'claude-sonnet-5-5', pro: 'claude-opus-5-5' }, keyName: 'ANTHROPIC_API_KEY' },
  gemini: { key: ENV_GEMINI || ENV_GENERIC, base: 'https://generativelanguage.googleapis.com/v1beta/openai', models: { fast: 'gemini-3.5-flash-lite', nova: 'gemini-3.6-flash', pro: 'gemini-3.8-flash' }, keyName: 'GEMINI_API_KEY' },
  openai: { key: ENV_GENERIC, base: '', models: { fast: '', nova: '', pro: '' }, keyName: 'API_KEY' }
};
const P = PROVIDERS[provider];

const CFG = {
  port: num('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')),
  provider,
  key: P.key,
  base: (process.env.API_BASE || process.env.ANTHROPIC_BASE_URL || P.base).replace(/\/+$/, ''),
  models: {
    fast: process.env.MODEL_FAST || P.models.fast,
    nova: process.env.MODEL_NOVA || P.models.nova,
    pro: process.env.MODEL_PRO || P.models.pro
  },
  dailyLimit: num('DAILY_LIMIT', 60),
  signupCode: (process.env.SIGNUP_CODE || '').trim(),
  trustProxy: process.env.TRUST_PROXY === '1'
};

if (!CFG.key) {
  console.error('\n' + P.keyName + ' set nahi hai.\n.env naam ki file banayein (.env.example se copy karein) aur us mein likhein:\n' + P.keyName + '=aapki-key\n');
  process.exit(1);
}
if (provider === 'openai' && (!CFG.base || !CFG.models.nova)) {
  console.error('\nPROVIDER=openai ke liye .env mein API_BASE aur MODEL_NOVA (aur MODEL_FAST, MODEL_PRO) bhi likhein.\n');
  process.exit(1);
}
CFG.models.fast = CFG.models.fast || CFG.models.nova;
CFG.models.pro = CFG.models.pro || CFG.models.nova;

/* ---------- database (ek JSON file) ---------- */
const DB_FILE = path.join(CFG.dataDir, 'db.json');
let db = { users: {}, emails: {}, sessions: {}, chats: {} };
fs.mkdirSync(CFG.dataDir, { recursive: true });
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
} catch (e) {
  if (e.code !== 'ENOENT') { console.error('data/db.json padh nahi saka:', e.message); process.exit(1); }
}
let saveTimer = null, dirty = false;
function save() { dirty = true; if (!saveTimer) saveTimer = setTimeout(flush, 300); }
function flush() {
  saveTimer = null;
  if (!dirty) return;
  dirty = false;
  const tmp = DB_FILE + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); }
  catch (e) { console.error('Database save nahi ho saka:', e.message); dirty = true; }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
process.on('exit', flush);

const now = () => Date.now();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newId = (p) => p + crypto.randomBytes(9).toString('base64url');
(function pruneSessions() {
  for (const k of Object.keys(db.sessions)) if (db.sessions[k].exp < now()) delete db.sessions[k];
})();

/* ---------- helpers ---------- */
const SESSION_DAYS = 30;
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, headers));
  res.end(body);
}
function json(res, status, obj, headers) {
  send(res, status, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => {
      try { const t = Buffer.concat(parts).toString('utf8'); resolve(t ? JSON.parse(t) : {}); }
      catch (e) { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isHttps(req) {
  return !!req.socket.encrypted || (CFG.trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}
function clientIp(req) {
  if (CFG.trustProxy) {
    const x = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (x) return x;
  }
  return req.socket.remoteAddress || 'unknown';
}
function sessionCookie(req, token, maxAgeSec) {
  return 'nova_sid=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAgeSec + (isHttps(req) ? '; Secure' : '');
}
function getUser(req) {
  const t = cookies(req).nova_sid;
  if (!t) return null;
  const s = db.sessions[sha(t)];
  if (!s || s.exp < now()) return null;
  return db.users[s.uid] || null;
}
const hits = new Map();
function rate(key, max, windowMs) {
  const t = now();
  const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(t); hits.set(key, arr); return true;
}
setInterval(() => { const t = now(); for (const [k, v] of hits) { const f = v.filter((x) => t - x < 3600000); if (f.length) hits.set(k, f); else hits.delete(k); } }, 600000).unref();

async function hashPassword(pw, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}
const DUMMY = { salt: crypto.randomBytes(16).toString('hex') };
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- auth routes ---------- */
async function signup(req, res) {
  const ip = clientIp(req);
  if (!rate('signup:' + ip, 10, 3600000)) return json(res, 429, { error: 'rate', message: 'Bohat ziada koshishein. Thori der baad dobara try karein.' });
  const b = await readBody(req, 10000);
  const name = String(b.name || '').trim().slice(0, 60);
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!name) return json(res, 400, { error: 'name', message: 'Apna naam likhein.' });
  if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'email', message: 'Sahi email likhein.' });
  if (password.length < 8 || password.length > 200) return json(res, 400, { error: 'password', message: 'Password kam az kam 8 characters ka hona chahiye.' });
  if (CFG.signupCode && String(b.code || '').trim() !== CFG.signupCode) return json(res, 403, { error: 'code', message: 'Invite code galat hai.' });
  if (db.emails[email]) return json(res, 409, { error: 'exists', message: 'Is email se account pehle se bana hua hai. Log in karein.' });
  const { salt, hash } = await hashPassword(password);
  if (db.emails[email]) return json(res, 409, { error: 'exists', message: 'Is email se account pehle se bana hua hai. Log in karein.' });
  const user = { id: newId('u'), name, email, salt, hash, created: now(), usage: { day: today(), count: 0 } };
  db.users[user.id] = user; db.emails[email] = user.id;
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha(token)] = { uid: user.id, exp: now() + SESSION_DAYS * 86400000 };
  save();
  json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
}
async function login(req, res) {
  const ip = clientIp(req);
  const b = await readBody(req, 10000);
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!rate('login-ip:' + ip, 30, 600000) || !rate('login:' + email, 10, 600000)) {
    return json(res, 429, { error: 'rate', message: 'Bohat ziada koshishein. 10 minute baad dobara try karein.' });
  }
  const user = db.users[db.emails[email]];
  const h = await hashPassword(password.slice(0, 200), user ? user.salt : DUMMY.salt);
  const ok = !!user && crypto.timingSafeEqual(Buffer.from(h.hash, 'hex'), Buffer.from(user.hash, 'hex'));
  if (!ok) return json(res, 401, { error: 'credentials', message: 'Email ya password galat hai.' });
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha(token)] = { uid: user.id, exp: now() + SESSION_DAYS * 86400000 };
  save();
  json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
}
function logout(req, res) {
  const t = cookies(req).nova_sid;
  if (t) { delete db.sessions[sha(t)]; save(); }
  json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}

/* ---------- Claude API ---------- */
function systemPrompt() {
  return [
    'You are Nova, an AI assistant created by Maher and shown to people as Nova AI.',
    'Answer any question on any subject clearly, accurately and in depth where needed: study, science, coding, business, health, law, finance, writing, translation, daily life and more.',
    'Always reply in the same language and script the user writes in (Urdu script, Roman Urdu, English or any other). If the user mixes languages, mirror them.',
    'Be direct and well structured. Use short headings, lists, tables or code blocks only when they help. Give step by step answers for how-to questions and complete working code for programming questions.',
    'For medical, legal and financial questions give real, useful information and mention briefly when a qualified professional should be consulted.',
    'If you are unsure or a fact may be out of date, say so instead of guessing. You cannot browse the internet or open files in this chat. You are an AI and never claim to be human.',
    'If asked who you are, say you are Nova AI, made by Maher. If asked which underlying model or company\'s technology powers you, say you cannot share details about the underlying technology. Never claim to be a different named assistant.',
    'You can also create images: the person can press the Create image button or write a request such as "image banao: ...". If they ask for a picture and you are replying in plain text, tell them this.',
    'Today\'s date is ' + today() + '.'
  ].join('\n');
}
function imagePrompt(request, context) {
  return [
    "You are Nova's image artist. Draw one polished vector image for the request below.",
    'Reply with ONLY one complete SVG document, starting with <svg and ending with </svg>. No markdown fences and no explanation.',
    'Rules: include xmlns="http://www.w3.org/2000/svg" and a viewBox of 0 0 1024 1024 (square), 0 0 1280 720 (wide scene, banner, wallpaper) or 0 0 720 1280 (tall poster, phone wallpaper). Fill the whole canvas with a background shape.',
    'Make it rich and professional: layered shapes, linearGradient and radialGradient fills, soft shadows, highlights, clear focal subject, balanced composition and a harmonious palette. Use paths and basic shapes only. No scripts, no <image>, no foreignObject, no external links or fonts.',
    'Add text only if the request asks for words, logo lettering or a poster title, and then use font-family="Arial, sans-serif" with correct spelling, sized to fit.',
    context ? 'Earlier request in this chat, in case this one refines it:\n' + context : '',
    'Request:\n' + request
  ].filter(Boolean).join('\n\n');
}

async function streamAnthropic({ model, system, messages, maxTokens, signal, onText }) {
  const r = await fetch(CFG.base + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': CFG.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, stream: true }),
    signal
  });
  if (!r.ok) {
    let t = ''; try { t = await r.text(); } catch (e) { /* ignore */ }
    const err = new Error('upstream ' + r.status + ' ' + t.slice(0, 400)); err.status = r.status; throw err;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', stop = null;
  function handle(block) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta' && ev.delta.text) { text += ev.delta.text; onText(ev.delta.text); }
      else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
      else if (ev.type === 'error') { const err = new Error('upstream stream error ' + JSON.stringify(ev.error || {}).slice(0, 300)); err.status = 529; throw err; }
    }
  }
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); handle(block); }
  }
  if (buf.trim()) handle(buf);
  return { text, stop };
}

async function streamOpenAI({ model, system, messages, maxTokens, signal, onText }) {
  const r = await fetch(CFG.base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + CFG.key },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }].concat(messages), stream: true }),
    signal
  });
  if (!r.ok) {
    let t = ''; try { t = await r.text(); } catch (e) { /* ignore */ }
    const err = new Error('upstream ' + r.status + ' ' + t.slice(0, 400)); err.status = r.status; throw err;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', stop = null;
  function handle(block) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let ev; try { ev = JSON.parse(payload); } catch (e) { continue; }
      if (ev.error) { const err = new Error('upstream stream error ' + JSON.stringify(ev.error).slice(0, 300)); err.status = Number(ev.error.code) || 529; throw err; }
      const ch = ev.choices && ev.choices[0];
      if (!ch) continue;
      const piece = ch.delta && typeof ch.delta.content === 'string' ? ch.delta.content : '';
      if (piece) { text += piece; onText(piece); }
      if (ch.finish_reason) stop = ch.finish_reason === 'length' ? 'max_tokens' : ch.finish_reason;
    }
  }
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); handle(block); }
  }
  if (buf.trim()) handle(buf);
  return { text, stop };
}
const streamClaude = (opts) => (CFG.provider === 'anthropic' ? streamAnthropic(opts) : streamOpenAI(opts));

function toTurns(messages) {
  const turns = messages.map((m) => m.role === 'user'
    ? { role: 'user', content: m.content || '...' }
    : { role: 'assistant', content: m.kind === 'image' ? '[Nova ne yeh image banayi: ' + (m.prompt || '') + ']' : (m.content || '...') });
  let total = 0; const keep = [];
  for (let i = turns.length - 1; i >= 0 && keep.length < 24; i--) {
    total += turns[i].content.length;
    if (total > 120000) break;
    keep.unshift(turns[i]);
  }
  while (keep.length && keep[0].role !== 'user') keep.shift();
  return keep;
}

const active = new Map();
async function chat(req, res, user) {
  let b;
  try { b = await readBody(req, 200000); } catch (e) { return json(res, 400, { error: 'bad_request', message: 'Request theek nahi thi.' }); }
  const model = CFG.models[b.model] ? b.model : 'nova';
  const regenerate = b.regenerate === true;
  const text = String(b.text || '').trim();
  if (!regenerate && (!text || text.length > 12000)) return json(res, 400, { error: 'text', message: text ? 'Message bohat lamba hai (12000 characters tak).' : 'Message khali hai.' });

  let c = null;
  if (b.chatId) {
    c = db.chats[String(b.chatId)];
    if (!c || c.uid !== user.id) return json(res, 404, { error: 'not_found', message: 'Chat nahi mili.' });
  }
  let isImage = b.image === true;
  if (regenerate) {
    if (!c) return json(res, 400, { error: 'bad_request', message: 'Chat nahi mili.' });
    let k = c.messages.length;
    while (k > 0 && c.messages[k - 1].role === 'assistant') k--;
    if (k === 0) return json(res, 400, { error: 'bad_request', message: 'Dobara banane ke liye koi sawal nahi mila.' });
    isImage = !!c.messages[k - 1].img;
  }

  if ((active.get(user.id) || 0) >= 2) return json(res, 429, { error: 'busy', message: 'Pehle wala jawab mukammal hone dein.' });
  if (!rate('chat:' + user.id, 40, 60000)) return json(res, 429, { error: 'rate', message: 'Bohat tezi se messages. Thora ruk kar try karein.' });
  const cost = isImage ? 4 : 1;
  if (!user.usage || user.usage.day !== today()) user.usage = { day: today(), count: 0 };
  if (CFG.dailyLimit > 0 && user.usage.count + cost > CFG.dailyLimit) {
    return json(res, 429, { error: 'limit', message: 'Aaj ki limit (' + CFG.dailyLimit + ') poori ho gayi. Kal dobara aayein.' });
  }
  user.usage.count += cost;

  if (!c) {
    c = { id: newId('c'), uid: user.id, title: (isImage ? 'Image: ' : '') + text.replace(/\s+/g, ' ').slice(0, 48), updatedAt: now(), messages: [] };
    db.chats[c.id] = c;
  }
  if (regenerate) {
    while (c.messages.length && c.messages[c.messages.length - 1].role === 'assistant') c.messages.pop();
  } else {
    const um = { role: 'user', content: text }; if (isImage) um.img = true;
    c.messages.push(um);
  }
  c.updatedAt = now(); save();

  const last = c.messages[c.messages.length - 1];
  active.set(user.id, (active.get(user.id) || 0) + 1);
  res.writeHead(200, Object.assign({}, SECURITY_HEADERS, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' }));
  const ac = new AbortController();
  let finished = false;
  res.on('close', () => { if (!finished) ac.abort(); });
  const emit = (o) => { if (!res.writableEnded && !res.destroyed) res.write('data: ' + JSON.stringify(o) + '\n\n'); };
  emit({ type: 'meta', chatId: c.id, title: c.title });

  let partial = '', pinger = null;
  try {
    let tier = model;
    if (isImage && tier === 'fast') tier = 'nova';
    let result;
    if (isImage) {
      pinger = setInterval(() => emit({ type: 'ping' }), 8000);
      const prior = c.messages.slice(0, -1).filter((m) => m.role === 'user' && m.img).slice(-2).map((m) => m.content).join('\n');
      result = await streamClaude({ model: CFG.models[tier], system: 'You are a skilled vector illustrator.', messages: [{ role: 'user', content: imagePrompt(last.content, prior) }], maxTokens: 16000, signal: ac.signal, onText: (t) => { partial += t; } });
      const m = result.stop === 'max_tokens' ? null : result.text.match(/<svg[\s\S]*<\/svg>/i);
      if (!m) throw Object.assign(new Error('bad_image'), { code: 'bad_image' });
      const msg = { role: 'assistant', kind: 'image', svg: m[0], prompt: last.content };
      c.messages.push(msg); c.updatedAt = now(); save();
      finished = true; emit({ type: 'done', message: msg }); res.end();
    } else {
      result = await streamClaude({ model: CFG.models[tier], system: systemPrompt(), messages: toTurns(c.messages), maxTokens: 8192, signal: ac.signal, onText: (t) => { partial += t; emit({ type: 'delta', text: t }); } });
      if (!result.text.trim()) throw Object.assign(new Error('empty'), { code: 'empty' });
      const msg = { role: 'assistant', content: result.text }; if (result.stop === 'max_tokens') msg.truncated = true;
      c.messages.push(msg); c.updatedAt = now(); save();
      finished = true; emit({ type: 'done', message: msg }); res.end();
    }
  } catch (e) {
    if (ac.signal.aborted) {
      if (!isImage && partial.trim()) { c.messages.push({ role: 'assistant', content: partial }); c.updatedAt = now(); save(); }
      else if (!partial) { user.usage.count = Math.max(0, user.usage.count - cost); }
      finished = true; if (!res.writableEnded) res.end();
    } else {
      console.error('[chat error]', e && e.message);
      if (!partial) user.usage.count = Math.max(0, user.usage.count - cost);
      let code = 'upstream', message = 'Jawab nahi aa saka. Dobara koshish karein.';
      if (e && e.code === 'bad_image') { code = 'bad_image'; message = 'Image poori nahi ban saki. Dobara koshish karein ya description thori aasaan likhein.'; }
      else if (e && e.code === 'empty') { code = 'empty'; message = 'Jawab khali aaya. Sawal thora wazeh likh kar dobara bhejein.'; }
      else if (e && (e.status === 401 || e.status === 403)) { code = 'config'; message = 'Server ki API key theek nahi hai. Admin ko batayein.'; console.error('>>> API key check karein (401/403). Key sahi aur active honi chahiye.'); }
      else if (e && (e.status === 404 || e.status === 400) && /model/i.test(e.message)) { code = 'config'; message = 'Server ka model setting theek nahi hai. Admin ko batayein.'; console.error('>>> MODEL_* settings check karein (404). Model ka naam shayad badal gaya hai.'); }
      else if (e && (e.status === 429 || e.status === 529 || e.status === 503)) { code = 'busy_upstream'; message = 'Nova abhi masroof hai. Thori der baad dobara koshish karein.'; }
      if (partial && !isImage) { c.messages.push({ role: 'assistant', content: partial, truncated: true }); c.updatedAt = now(); save(); }
      finished = true;
      const detail = String((e && e.message) || 'unknown error').split(CFG.key).join('***').replace(/\s+/g, ' ').slice(0, 280);
      emit({ type: 'error', code, message, detail }); if (!res.writableEnded) res.end();
    }
  } finally {
    if (pinger) clearInterval(pinger);
    const n = (active.get(user.id) || 1) - 1; if (n <= 0) active.delete(user.id); else active.set(user.id, n);
    save();
  }
}

/* ---------- API router ---------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  if (m !== 'GET' && m !== 'HEAD' && req.headers['x-nova'] !== '1') return json(res, 403, { error: 'csrf', message: 'Request rad kar di gayi.' });

  if (p === '/api/config' && m === 'GET') return json(res, 200, { inviteRequired: !!CFG.signupCode, dailyLimit: CFG.dailyLimit });
  if (p === '/api/signup' && m === 'POST') return signup(req, res);
  if (p === '/api/login' && m === 'POST') return login(req, res);
  if (p === '/api/logout' && m === 'POST') return logout(req, res);

  const user = getUser(req);
  if (!user) return json(res, 401, { error: 'auth', message: 'Pehle log in karein.' });

  if (p === '/api/me' && m === 'GET') {
    const used = user.usage && user.usage.day === today() ? user.usage.count : 0;
    return json(res, 200, { user: publicUser(user), usage: { used, limit: CFG.dailyLimit } });
  }
  if (p === '/api/chats' && m === 'GET') {
    const list = Object.values(db.chats).filter((c) => c.uid === user.id).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300).map((c) => ({ id: c.id, title: c.title || 'Nayi chat', updatedAt: c.updatedAt }));
    return json(res, 200, { chats: list });
  }
  if (p === '/api/chat' && m === 'POST') return chat(req, res, user);

  const mm = p.match(/^\/api\/chats\/([A-Za-z0-9_-]{1,40})(\/feedback)?$/);
  if (mm) {
    const c = db.chats[mm[1]];
    if (!c || c.uid !== user.id) return json(res, 404, { error: 'not_found', message: 'Chat nahi mili.' });
    if (!mm[2] && m === 'GET') return json(res, 200, { id: c.id, title: c.title, messages: c.messages });
    if (!mm[2] && m === 'DELETE') { delete db.chats[c.id]; save(); return json(res, 200, { ok: true }); }
    if (mm[2] && m === 'POST') {
      let b; try { b = await readBody(req, 5000); } catch (e) { return json(res, 400, { error: 'bad_request', message: 'Request theek nahi thi.' }); }
      const i = Number(b.index);
      if (!Number.isInteger(i) || i < 0 || i >= c.messages.length || c.messages[i].role !== 'assistant') return json(res, 400, { error: 'bad_request', message: 'Message nahi mila.' });
      if (b.value === 'up' || b.value === 'down') c.messages[i].fb = b.value; else delete c.messages[i].fb;
      save(); return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: 'not_found', message: 'Nahi mila.' });
}

/* ---------- static files ---------- */
const PUBLIC = path.join(__dirname, 'public');
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml']
};
function serveStatic(req, res, url) {
  const f = FILES[url.pathname];
  if (!f || (req.method !== 'GET' && req.method !== 'HEAD')) return json(res, 404, { error: 'not_found', message: 'Nahi mila.' });
  fs.readFile(path.join(PUBLIC, f[0]), (err, data) => {
    if (err) return json(res, 500, { error: 'server', message: 'File nahi mili.' });
    send(res, 200, req.method === 'HEAD' ? undefined : data, { 'Content-Type': f[1], 'Cache-Control': 'no-cache' });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (e && (e.message === 'too_large' || e.message === 'bad_json')) {
      if (!res.headersSent) json(res, e.message === 'too_large' ? 413 : 400, { error: 'bad_request', message: 'Request theek nahi thi.' });
      return;
    }
    console.error('[server error]', e);
    if (!res.headersSent) json(res, 500, { error: 'server', message: 'Server mein masla aa gaya. Dobara koshish karein.' });
    else if (!res.writableEnded) res.end();
  }
});

/* ---------- startup check (Gemini / OpenAI-style providers) ---------- */
const EXPLICIT = { fast: !!process.env.MODEL_FAST, nova: !!process.env.MODEL_NOVA, pro: !!process.env.MODEL_PRO };
const SKIP = /(live|tts|image|audio|transcribe|translate|embed|veo|imagen|robotics|computer|omni|native|aqa|learnlm|gemma|vision)/i;
function ver(id) { const m = id.match(/(\d+(?:\.\d+)?)/g) || []; return m.map(Number); }
function cmpVer(a, b) { const x = ver(a), y = ver(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (y[i] || 0) - (x[i] || 0); if (d) return d; } return 0; }
async function selfTest() {
  if (CFG.provider === 'anthropic') return;
  try {
    const r = await fetch(CFG.base + '/models', { headers: { authorization: 'Bearer ' + CFG.key }, signal: AbortSignal.timeout(20000) });
    if (r.status === 401 || r.status === 403 || r.status === 400) {
      console.error('\n  !! Key galat lagti hai (Google ne ' + r.status + ' diya). Key dobara copy kar ke .env mein theek se likhein.\n');
      return;
    }
    if (!r.ok) { console.error('\n  !! Google se list nahi mili (status ' + r.status + '). Chat phir bhi try hogi.\n'); return; }
    const data = await r.json();
    const ids = (data.data || data.models || []).map((m) => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
    if (!ids.length) return;
    console.log('  Key theek hai. Google se ' + ids.length + ' models mile.');
    const usable = ids.filter((id) => /^gemini-/.test(id) && /flash/.test(id) && !SKIP.test(id)).sort(cmpVer);
    const lite = usable.filter((id) => /lite/.test(id)), full = usable.filter((id) => !/lite/.test(id));
    const pick = { fast: lite[0] || full[0], nova: full[0] || lite[0], pro: full[0] || lite[0] };
    for (const t of ['fast', 'nova', 'pro']) {
      if (ids.indexOf(CFG.models[t]) >= 0) continue;
      if (EXPLICIT[t]) { console.error('  !! ' + t.toUpperCase() + ' model "' + CFG.models[t] + '" Google ki list mein nahi hai.'); continue; }
      if (pick[t]) { console.log('  Model "' + CFG.models[t] + '" nahi mila, "' + pick[t] + '" use ho raha hai.'); CFG.models[t] = pick[t]; }
    }
    console.log('  Models: ' + [CFG.models.fast, CFG.models.nova, CFG.models.pro].join(', ') + '\n');
  } catch (e) {
    console.error('\n  !! Google se rabta nahi ho saka (' + (e && e.message) + '). Internet check karein. Agar internet theek hai to VPN ya DNS try karein.\n');
  }
}
server.requestTimeout = 0;
server.listen(CFG.port, CFG.host, () => {
  console.log('\n  Nova AI chal raha hai:  http://localhost:' + CFG.port);
  console.log('  Provider: ' + CFG.provider + '  |  Models: ' + [CFG.models.fast, CFG.models.nova, CFG.models.pro].join(', '));
  console.log('  Roz ki limit har user ke liye: ' + (CFG.dailyLimit || 'unlimited') + (CFG.signupCode ? '  |  Invite code zaroori hai' : '') + '\n');
  selfTest();
});
