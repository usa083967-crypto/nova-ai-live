(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var STAR = '<svg class="av" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 1.5c.7 6.2 3.1 10.4 6.4 12.4 2.1 1.3 4.9 2.1 8.1 2.1-3.2 0-6 .8-8.1 2.1C19.1 20.1 16.7 24.3 16 30.5c-.7-6.2-3.1-10.4-6.4-12.4-2.1-1.3-4.9-2.1-8.1-2.1 3.2 0 6-.8 8.1-2.1C12.9 11.9 15.3 7.7 16 1.5Z"/></svg>';
  var ICON = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9h3zM7 11l4-8a2.5 2.5 0 012.5 3V9H19a2 2 0 012 2.3l-1.2 7A2 2 0 0117.8 20H7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 13V4h3v9h-3zM17 13l-4 8a2.5 2.5 0 01-2.5-3V15H5a2 2 0 01-2-2.3l1.2-7A2 2 0 016.2 4H17"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    tick: '<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>'
  };
  var MODELS = {
    fast: { name: "Nova 1 Fast", desc: "Tez jawab, rozmarra ke sawalon ke liye" },
    nova: { name: "Nova 1", desc: "Har kaam ke liye behtareen balance" },
    pro: { name: "Nova 1 Pro", desc: "Gehri soch, mushkil sawal aur lambi tehreer" }
  };
  var IMG_NOUN = /\b(images?|tasveer|tasveeren|tasvir|tasweer|pictures?|pics?|photos?|logos?|posters?|illustrations?|wallpapers?|artworks?|paintings?|sketch|drawing|icons?|banners?|cartoons?)\b|تصویر|لوگو|پوسٹر/i;
  var IMG_VERB = /\b(bana|banao|banado|banaye|banaiye|bnao|bna|create|generate|make|draw|design|paint)\b|بنا/i;
  var NOT_IMG = /\b(how|kaise|kese|kaisay|tips|steps|tutorial|plan|explain)\b/i;
  function wantsImage(t) { return IMG_NOUN.test(t) && IMG_VERB.test(t) && !NOT_IMG.test(t); }

  var S = { me: null, usage: null, chats: [], current: null, model: "nova", busy: false, ctl: null, imageMode: false, query: "", authMode: "login", config: { inviteRequired: false } };
  var toastTimer = null, armed = null;

  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
  }

  /* ---------- API ---------- */
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: { "X-Nova": "1" }, signal: opts.signal };
    if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) { var e = new Error(data.message || "Masla aa gaya."); e.status = r.status; e.code = data.error; throw e; }
        return data;
      });
    });
  }

  /* ---------- theme ---------- */
  function applyTheme(t) {
    var r = document.documentElement;
    if (t === "light" || t === "dark") r.setAttribute("data-theme", t); else r.removeAttribute("data-theme");
    var cur = (t === "light" || t === "dark") ? t : "system";
    Array.prototype.forEach.call($("themeSeg").children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-t") === cur)); });
  }
  applyTheme(LS.get("nova.theme") || "system");
  $("themeSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var t = b.getAttribute("data-t"); LS.set("nova.theme", t); applyTheme(t);
  });

  /* ---------- markdown ---------- */
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function cells(line) { return line.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); }
  function md(src) {
    var codes = [];
    src = src.replace(/```[^\n]*\n?([\s\S]*?)(```|$)/g, function (m, c) {
      codes.push("<pre><code>" + esc(c.replace(/\n$/, "")) + "</code></pre>");
      return "\n\u0000" + (codes.length - 1) + "\u0000\n";
    });
    var lines = src.split("\n"), out = [], i = 0;
    while (i < lines.length) {
      var ln = lines[i], m;
      if (!ln.trim()) { i++; continue; }
      if ((m = ln.match(/^\u0000(\d+)\u0000$/))) { out.push(codes[+m[1]]); i++; continue; }
      if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { var h = Math.min(m[1].length + 1, 4); out.push("<h" + h + ">" + inline(m[2]) + "</h" + h + ">"); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        var head = cells(ln), rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push('<div class="tablewrap"><table><thead><tr>' + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>");
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(ln)) {
        var ordered = /^\s*\d+[.)]\s+/.test(ln), items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "")); i++; }
        var tag = ordered ? "ol" : "ul";
        out.push("<" + tag + ">" + items.map(function (t) { return "<li>" + inline(t) + "</li>"; }).join("") + "</" + tag + ">");
        continue;
      }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*+]|\d+[.)])\s|\u0000\d+\u0000$|\s*\|.*\|\s*$)/.test(lines[i])) { para.push(lines[i]); i++; }
      if (!para.length) { para.push(lines[i]); i++; }
      out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    }
    return out.join("");
  }

  /* ---------- SVG image handling ---------- */
  function cleanSvg(text) {
    var m = String(text || "").match(/<svg[\s\S]*<\/svg>/i);
    if (!m) return null;
    var src = m[0];
    if (src.length > 1500000) return null;
    if (!/<svg[^>]*\sxmlns\s*=/i.test(src)) src = src.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    if (/xlink:/i.test(src) && !/xmlns:xlink\s*=/i.test(src)) src = src.replace(/<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    var doc = new DOMParser().parseFromString(src, "image/svg+xml");
    if (doc.getElementsByTagName("parsererror").length) return null;
    var root = doc.documentElement;
    if (!root || root.localName !== "svg") return null;
    Array.prototype.forEach.call(root.querySelectorAll("script,foreignObject,image,iframe,object,embed,audio,video"), function (n) { n.remove(); });
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*")));
    all.forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        var n = a.name.toLowerCase(), v = a.value;
        if (n.indexOf("on") === 0) { el.removeAttribute(a.name); return; }
        if ((n === "href" || n === "xlink:href") && v.trim().charAt(0) !== "#") { el.removeAttribute(a.name); return; }
        if (n === "style") el.setAttribute(a.name, v.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none"));
      });
      if (el.localName === "style") el.textContent = el.textContent.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none");
    });
    if (!root.getAttribute("viewBox")) {
      var w = parseFloat(root.getAttribute("width")) || 1024, h = parseFloat(root.getAttribute("height")) || 1024;
      root.setAttribute("viewBox", "0 0 " + w + " " + h);
    }
    root.removeAttribute("width"); root.removeAttribute("height");
    return new XMLSerializer().serializeToString(root);
  }
  function svgDims(svg) {
    var m = svg.match(/viewBox="\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i);
    var w = m ? parseFloat(m[1]) : 1024, h = m ? parseFloat(m[2]) : 1024;
    if (!(w > 0) || !(h > 0)) { w = 1024; h = 1024; }
    return { w: w, h: h };
  }
  function svgUrl(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
  function svgToPng(svg) {
    return new Promise(function (resolve, reject) {
      var d = svgDims(svg), k = 1536 / Math.max(d.w, d.h), W = Math.round(d.w * k), H = Math.round(d.h * k);
      var sized = svg.replace(/<svg/i, '<svg width="' + W + '" height="' + H + '"');
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement("canvas"); c.width = W; c.height = H;
          var x = c.getContext("2d"); x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H); x.drawImage(img, 0, 0, W, H);
          c.toBlob(function (b) { b ? resolve(b) : reject(new Error("png")); }, "image/png");
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error("load")); };
      img.src = svgUrl(sized);
    });
  }
  function slug(t) { var s = String(t || "nova-image").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); return s || "nova-image"; }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  async function downloadImage(m) {
    var svg = cleanSvg(m.svg); if (!svg) { toast("Image save nahi ho saki."); return; }
    try { saveBlob(await svgToPng(svg), slug(m.prompt) + ".png"); }
    catch (e) { saveBlob(new Blob([svg], { type: "image/svg+xml" }), slug(m.prompt) + ".svg"); }
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  /* ---------- sidebar ---------- */
  function groupOf(ts) {
    var n = new Date(), d0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(), day = 86400000;
    if (ts >= d0) return "Today";
    if (ts >= d0 - day) return "Yesterday";
    if (ts >= d0 - 7 * day) return "Previous 7 days";
    return "Older";
  }
  function renderList() {
    var el = $("list"); el.textContent = "";
    var q = S.query.trim().toLowerCase();
    var items = S.chats.filter(function (c) { return !q || (c.title || "").toLowerCase().indexOf(q) >= 0; });
    if (!items.length) {
      var e = document.createElement("div"); e.className = "empty";
      e.textContent = q ? "Koi chat nahi mili." : "Aap ki chats yahan nazar aayengi.";
      el.append(e); return;
    }
    var last = "";
    items.forEach(function (c) {
      var g = groupOf(c.updatedAt);
      if (g !== last) { var h = document.createElement("div"); h.className = "grp"; h.textContent = g; el.append(h); last = g; }
      var row = document.createElement("div"); row.className = "row" + (S.current && S.current.id === c.id ? " on" : "");
      var t = document.createElement("button"); t.type = "button"; t.className = "t"; t.textContent = c.title || "Nayi chat"; t.title = c.title || "";
      t.addEventListener("click", function () { openChat(c.id); });
      var x = document.createElement("button"); x.type = "button"; x.className = "x" + (armed === c.id ? " arm" : ""); x.setAttribute("aria-label", "Delete chat");
      if (armed === c.id) x.textContent = "Delete?"; else x.innerHTML = ICON.trash;
      x.addEventListener("click", function () {
        if (armed === c.id) { armed = null; deleteChat(c.id); } else { armed = c.id; renderList(); }
      });
      row.append(t, x); el.append(row);
    });
  }
  function refreshList() {
    return api("/api/chats").then(function (d) { S.chats = d.chats || []; renderList(); }).catch(function (e) { if (e.status === 401) showAuth("login"); });
  }
  function closeSide() { $("app").classList.remove("open"); }
  $("menuBtn").addEventListener("click", function () { $("app").classList.add("open"); });
  $("scrim").addEventListener("click", closeSide);
  $("closeSide").addEventListener("click", closeSide);
  $("search").addEventListener("input", function (e) { S.query = e.target.value; armed = null; renderList(); });

  /* ---------- menus ---------- */
  function buildModelMenu() {
    var m = $("modelMenu"); m.textContent = "";
    Object.keys(MODELS).forEach(function (k) {
      var b = document.createElement("button"); b.type = "button"; b.className = "item";
      var w = document.createElement("span");
      var n = document.createElement("b"); n.textContent = MODELS[k].name;
      var d = document.createElement("small"); d.textContent = MODELS[k].desc;
      w.append(n, d); b.append(w);
      if (S.model === k) b.insertAdjacentHTML("beforeend", ICON.tick);
      b.addEventListener("click", function () { S.model = k; LS.set("nova.model", k); $("modelName").textContent = MODELS[k].name; closeMenus(); });
      m.append(b);
    });
  }
  function closeMenus() {
    $("modelMenu").hidden = true; $("modelBtn").setAttribute("aria-expanded", "false");
    $("userMenu").hidden = true; $("userBtn").setAttribute("aria-expanded", "false");
  }
  $("modelBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    var open = $("modelMenu").hidden; closeMenus();
    if (open) { buildModelMenu(); $("modelMenu").hidden = false; $("modelBtn").setAttribute("aria-expanded", "true"); }
  });
  $("userBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    var open = $("userMenu").hidden; closeMenus();
    if (open) { renderUsage(); $("userMenu").hidden = false; $("userBtn").setAttribute("aria-expanded", "true"); }
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".pop")) closeMenus(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenus(); closeSide(); } });
  if (MODELS[LS.get("nova.model")]) S.model = LS.get("nova.model");
  $("modelName").textContent = MODELS[S.model].name;
  function renderUsage() {
    var u = S.usage;
    $("usage").textContent = u && u.limit > 0 ? "Aaj ke messages: " + u.used + " / " + u.limit : "";
  }

  /* ---------- feed ---------- */
  var feed = $("feed");
  function nearBottom() { return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 140; }
  function toBottom() { feed.scrollTop = feed.scrollHeight; }
  var CHIPS = [
    ["Image", "Ek khoobsurat sunset ka image banao"],
    ["Sehat", "Neend behtar karne ke 5 asaan tareeqe batao"],
    ["Code", "Write a Python function to check if a number is prime"],
    ["Career", "Mere liye ek professional CV summary likho"]
  ];
  function renderWelcome() {
    feed.textContent = "";
    var w = document.createElement("div"); w.className = "col welcome";
    w.innerHTML = '<svg class="logo star" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 1.5c.7 6.2 3.1 10.4 6.4 12.4 2.1 1.3 4.9 2.1 8.1 2.1-3.2 0-6 .8-8.1 2.1C19.1 20.1 16.7 24.3 16 30.5c-.7-6.2-3.1-10.4-6.4-12.4-2.1-1.3-4.9-2.1-8.1-2.1 3.2 0 6-.8 8.1-2.1C12.9 11.9 15.3 7.7 16 1.5Z"/></svg><h1>Main Nova hoon.<br><span>Kis cheez mein madad karoon?</span></h1>';
    var c = document.createElement("div"); c.className = "chips";
    CHIPS.forEach(function (x) {
      var b = document.createElement("button"); b.type = "button"; b.className = "chip";
      var s = document.createElement("small"); s.textContent = x[0];
      var t = document.createElement("span"); t.textContent = x[1];
      b.append(s, t); b.addEventListener("click", function () { submit(x[1]); });
      c.append(b);
    });
    w.append(c); feed.append(w);
  }
  function actBtn(html, label, fn, on) {
    var b = document.createElement("button"); b.type = "button"; b.innerHTML = html; b.title = label; b.setAttribute("aria-label", label);
    if (on) b.classList.add("on");
    b.addEventListener("click", fn); return b;
  }
  function buildMsg(chat, m, idx, isLast) {
    var d = document.createElement("div");
    if (m.role === "user") {
      d.className = "msg user";
      var u = document.createElement("div"); u.className = "ubody"; u.textContent = m.content; d.append(u); return d;
    }
    d.className = "msg bot"; d.innerHTML = STAR;
    var c = document.createElement("div"); c.className = "c"; d.append(c);
    var acts = document.createElement("div"); acts.className = "acts";
    var clean = null;
    if (m.kind === "image") {
      clean = cleanSvg(m.svg);
      if (clean) {
        var f = document.createElement("figure"); f.className = "fig";
        var img = document.createElement("img"); img.alt = m.prompt || "Nova image"; img.src = svgUrl(clean);
        var dm = svgDims(clean); img.style.aspectRatio = dm.w + " / " + dm.h;
        var cap = document.createElement("figcaption"); cap.textContent = m.prompt || "";
        f.append(img, cap); c.append(f);
        acts.append(actBtn(ICON.dl, "Download", function () { downloadImage(m); }));
      } else {
        var bad = document.createElement("div"); bad.className = "body"; bad.textContent = "Yeh image dikhai nahi ja saki."; c.append(bad);
      }
    } else {
      var b = document.createElement("div"); b.className = "body"; b.innerHTML = md(m.content || ""); c.append(b);
      if (m.truncated) { var n = document.createElement("div"); n.className = "note"; n.textContent = "Jawab beech mein ruk gaya. “Aage likho” likh kar jaari rakhein."; c.append(n); }
      acts.append(actBtn(ICON.copy, "Copy", function () {
        copyText(m.content || "").then(function (ok) { toast(ok ? "Copy ho gaya." : "Copy nahi ho saka. Text select kar ke copy karein."); });
      }));
    }
    function fb(v) {
      return function (e) {
        var btn = e.currentTarget, bar = btn.parentNode;
        var next = m.fb === v ? null : v;
        if (next) m.fb = next; else delete m.fb;
        bar.querySelectorAll("[data-fb]").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-fb") === m.fb); });
        if (chat.id) api("/api/chats/" + chat.id + "/feedback", { method: "POST", body: { index: idx, value: next } }).catch(function () {});
      };
    }
    var up = actBtn(ICON.up, "Achha jawab", fb("up"), m.fb === "up"); up.setAttribute("data-fb", "up");
    var dn = actBtn(ICON.down, "Behtar ho sakta tha", fb("down"), m.fb === "down"); dn.setAttribute("data-fb", "down");
    acts.append(up, dn);
    if (isLast) acts.append(actBtn(ICON.redo, "Dobara banayein", regenerate));
    c.append(acts);
    return d;
  }
  function renderFeed() {
    var chat = S.current; feed.textContent = "";
    if (!chat || !chat.messages.length) { renderWelcome(); return; }
    var col = document.createElement("div"); col.className = "col msgs";
    chat.messages.forEach(function (m, i) { col.append(buildMsg(chat, m, i, i === chat.messages.length - 1 && m.role === "assistant")); });
    feed.append(col); toBottom();
  }

  /* ---------- chat actions ---------- */
  function newConversation() {
    stopGen(); closeSide(); armed = null;
    S.current = { id: null, title: "", messages: [] };
    renderFeed(); renderList(); $("input").focus();
  }
  function stopGen() { if (S.ctl) S.ctl.abort(); }
  async function openChat(id) {
    closeSide();
    if (S.current && S.current.id === id) return;
    stopGen(); armed = null;
    var meta = S.chats.find(function (c) { return c.id === id; }) || {};
    var chat = { id: id, title: meta.title || "", messages: [] };
    S.current = chat; renderList();
    feed.textContent = ""; var l = document.createElement("div"); l.className = "col empty"; l.textContent = "Chat load ho rahi hai…"; feed.append(l);
    try {
      var d = await api("/api/chats/" + id);
      chat.messages = d.messages || []; chat.title = d.title || chat.title;
    } catch (e) {
      if (e.status === 401) { showAuth("login"); return; }
      toast("Chat load nahi ho saki.");
    }
    if (S.current === chat) renderFeed();
  }
  async function deleteChat(id) {
    try { await api("/api/chats/" + id, { method: "DELETE" }); }
    catch (e) { if (e.status === 401) { showAuth("login"); return; } toast("Chat delete nahi ho saki."); return; }
    S.chats = S.chats.filter(function (c) { return c.id !== id; });
    if (S.current && S.current.id === id) newConversation(); else renderList();
  }
  async function resync(chat) {
    if (!chat.id) return;
    try {
      var d = await api("/api/chats/" + chat.id);
      chat.messages = d.messages || [];
    } catch (e) {}
    if (S.current === chat) renderFeed();
  }
  function setBusy(v) {
    S.busy = v;
    var b = $("send");
    b.innerHTML = v ? ICON.stop : ICON.send;
    b.setAttribute("aria-label", v ? "Stop" : "Send");
    b.disabled = false;
  }
  function errorRow(col, text, retry, detail) {
    var er = document.createElement("div"); er.className = "msg bot"; er.innerHTML = STAR;
    var ec = document.createElement("div"); ec.className = "c err";
    var tx = document.createElement("span"); tx.textContent = text; ec.append(tx);
    if (detail) { var dt = document.createElement("div"); dt.className = "note"; dt.textContent = "Detail: " + detail; er.dataset.detail = "1"; ec.append(dt); }
    if (retry) {
      var rb = document.createElement("button"); rb.type = "button"; rb.textContent = "Dobara koshish karein";
      rb.addEventListener("click", function () { er.remove(); respond({ regenerate: true }); }); ec.append(rb);
    }
    er.append(ec); col.append(er); toBottom();
  }

  async function respond(opts) {
    var chat = S.current; if (!chat || S.busy) return;
    var regenerate = !!(opts && opts.regenerate);
    var last = chat.messages[chat.messages.length - 1];
    var isImg = regenerate ? !!(function () { for (var i = chat.messages.length - 1; i >= 0; i--) if (chat.messages[i].role === "user") return chat.messages[i].img; })() : !!(last && last.img);
    if (regenerate) { while (chat.messages.length && chat.messages[chat.messages.length - 1].role === "assistant") chat.messages.pop(); }
    var userText = !regenerate && last ? last.content : "";
    var ctl = new AbortController(); S.ctl = ctl; setBusy(true);
    renderFeed();
    var col = feed.querySelector(".msgs");
    var shell = document.createElement("div"); shell.className = "msg bot"; shell.innerHTML = STAR;
    var c = document.createElement("div"); c.className = "c"; shell.append(c);
    var body = document.createElement("div"); body.className = "body"; c.append(body);
    var timer = null, live = function () { return S.current === chat; };
    if (isImg) {
      var secs = 0;
      body.innerHTML = '<div class="imgwait"><div><b>Nova image bana rahi hai</b><span id="imgsecs">0s</span></div></div>';
      timer = setInterval(function () { secs++; var s = document.getElementById("imgsecs"); if (s) s.textContent = secs + "s"; }, 1000);
    } else body.innerHTML = '<span class="dots" aria-label="Thinking"><i></i><i></i><i></i></span>';
    col.append(shell); toBottom();

    var answer = "", gotFinal = false, errEvt = null;
    try {
      var res = await fetch("/api/chat", {
        method: "POST", credentials: "same-origin", signal: ctl.signal,
        headers: { "Content-Type": "application/json", "X-Nova": "1" },
        body: JSON.stringify({ chatId: chat.id, text: userText, image: isImg, model: S.model, regenerate: regenerate })
      });
      if (!res.ok) {
        var data = await res.json().catch(function () { return {}; });
        var e0 = new Error(data.message || "Masla aa gaya."); e0.status = res.status; e0.pre = true; throw e0;
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
      for (;;) {
        var r = await reader.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          var block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          var line = block.split("\n").filter(function (l) { return l.indexOf("data:") === 0; })[0];
          if (!line) continue;
          var ev; try { ev = JSON.parse(line.slice(5)); } catch (x) { continue; }
          if (ev.type === "meta") {
            if (!chat.id) { chat.id = ev.chatId; chat.title = ev.title; }
            if (!S.chats.some(function (x) { return x.id === chat.id; })) { S.chats.unshift({ id: chat.id, title: chat.title || "Nayi chat", updatedAt: Date.now() }); renderList(); }
          } else if (ev.type === "delta") {
            answer += ev.text;
            if (live() && !isImg) { var stick = nearBottom(); body.innerHTML = md(answer); if (stick) toBottom(); }
          } else if (ev.type === "done") {
            gotFinal = true; chat.messages.push(ev.message);
          } else if (ev.type === "error") { errEvt = ev; }
        }
      }
    } catch (e) {
      if (e && e.pre) {
        if (timer) clearInterval(timer);
        S.ctl = null; setBusy(false);
        if (e.status === 401) { showAuth("login", "Session khatam ho gaya. Dobara log in karein."); return; }
        if (!regenerate) { chat.messages.pop(); if (!$("input").value) { $("input").value = userText; autosize(); } }
        if (regenerate) await resync(chat);
        if (live()) { renderFeed(); var col2 = feed.querySelector(".msgs"); if (col2) errorRow(col2, e.message, false); else toast(e.message); }
        else toast(e.message);
        return;
      }
      if (ctl.signal.aborted) { errEvt = null; }
      else if (!errEvt) errEvt = { message: "Connection toot gaya. Dobara koshish karein." };
    } finally {
      if (timer) clearInterval(timer);
      if (S.ctl === ctl) S.ctl = null;
      setBusy(false);
    }
    if (gotFinal) { if (live()) renderFeed(); }
    else {
      if (ctl.signal.aborted) await new Promise(function (r) { setTimeout(r, 600); });
      await resync(chat);
    }
    refreshList(); refreshMe();
    if (errEvt && live()) {
      var col3 = feed.querySelector(".msgs");
      if (col3) errorRow(col3, errEvt.message, errEvt.code !== "config", errEvt.detail);
    }
  }
  function refreshMe() { api("/api/me").then(function (d) { S.usage = d.usage; }).catch(function () {}); }
  function submit(text) {
    text = (text || "").trim();
    if (S.busy || !text) return;
    if (!S.current) S.current = { id: null, title: "", messages: [] };
    var img = S.imageMode || wantsImage(text);
    var m = { role: "user", content: text }; if (img) m.img = true;
    S.current.messages.push(m);
    $("input").value = ""; autosize();
    if (S.imageMode) setImageMode(false);
    respond();
  }
  function regenerate() { if (!S.busy) respond({ regenerate: true }); }

  /* ---------- composer ---------- */
  var input = $("input");
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; }
  function setImageMode(v) {
    S.imageMode = v; $("imgBtn").setAttribute("aria-pressed", String(v));
    input.placeholder = v ? "Image ka description likhein, jaise “pahadon par sunrise”" : "Nova se kuch bhi poochein";
  }
  $("imgBtn").addEventListener("click", function () { setImageMode(!S.imageMode); input.focus(); });
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!S.busy) submit(input.value); }
  });
  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (S.busy) { stopGen(); return; }
    submit(input.value);
  });
  $("newBtn").addEventListener("click", newConversation);

  /* ---------- auth ---------- */
  function showAuth(mode, msg) {
    stopGen(); closeMenus(); closeSide();
    $("boot").hidden = true; $("app").hidden = true; $("auth").hidden = false;
    S.me = null; S.chats = []; S.current = null;
    setAuthMode(mode || "login");
    var er = $("authErr"); er.hidden = !msg; er.textContent = msg || "";
    $("aPass").value = "";
  }
  function setAuthMode(m) {
    S.authMode = m;
    var signup = m === "signup";
    $("authTitle").textContent = signup ? "Account banayein" : "Welcome back";
    $("authSub").textContent = signup ? "Nova AI ke liye naya account." : "Nova AI mein log in karein.";
    $("nameField").hidden = !signup;
    $("codeField").hidden = !(signup && S.config.inviteRequired);
    $("aPass").setAttribute("autocomplete", signup ? "new-password" : "current-password");
    $("authSubmit").textContent = signup ? "Create account" : "Continue";
    $("switchText").textContent = signup ? "Pehle se account hai?" : "Account nahi hai?";
    $("authSwitch").textContent = signup ? "Log in" : "Sign up";
    $("authErr").hidden = true;
  }
  $("authSwitch").addEventListener("click", function () { setAuthMode(S.authMode === "login" ? "signup" : "login"); });
  $("eyeBtn").addEventListener("click", function () {
    var p = $("aPass"), show = p.type === "password";
    p.type = show ? "text" : "password";
    this.textContent = show ? "Hide" : "Show"; this.setAttribute("aria-pressed", String(show));
    this.setAttribute("aria-label", show ? "Password chhupayein" : "Password dikhayein");
  });
  $("authForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var er = $("authErr"), btn = $("authSubmit"), signup = S.authMode === "signup";
    er.hidden = true;
    var email = $("aEmail").value.trim(), pass = $("aPass").value, name = $("aName").value.trim();
    if (signup && !name) { er.textContent = "Apna naam likhein."; er.hidden = false; $("aName").focus(); return; }
    if (!email || !pass) { er.textContent = "Email aur password likhein."; er.hidden = false; return; }
    btn.disabled = true; var label = btn.textContent; btn.textContent = "Ek lamha…";
    try {
      var body = signup ? { name: name, email: email, password: pass, code: $("aCode").value } : { email: email, password: pass };
      var d = await api(signup ? "/api/signup" : "/api/login", { method: "POST", body: body });
      S.me = d.user; $("aPass").value = "";
      await enterApp();
    } catch (err) {
      er.textContent = err.status ? err.message : "Server se rabta nahi ho saka. Internet check karein."; er.hidden = false;
    } finally { btn.disabled = false; btn.textContent = label; }
  });
  $("logoutBtn").addEventListener("click", async function () {
    try { await api("/api/logout", { method: "POST" }); } catch (e) {}
    showAuth("login");
  });
  async function enterApp() {
    $("boot").hidden = true; $("auth").hidden = true; $("app").hidden = false;
    $("uName").textContent = S.me.name; $("uSub").textContent = S.me.email;
    $("uAvatar").textContent = (S.me.name || "N").trim().charAt(0).toUpperCase() || "N";
    S.current = { id: null, title: "", messages: [] }; S.query = ""; $("search").value = ""; armed = null;
    setBusy(false); renderFeed(); renderList();
    await refreshList(); refreshMe();
    input.focus();
  }

  /* ---------- boot ---------- */
  (async function boot() {
    try { S.config = await api("/api/config"); } catch (e) {}
    try {
      var d = await api("/api/me");
      S.me = d.user; S.usage = d.usage;
      await enterApp();
    } catch (e) {
      showAuth("login");
    }
  })();
})();
