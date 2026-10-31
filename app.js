/* Nexus IA — lógica do app: login, chat, histórico, configurações */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const MD = window.NexusMD, API = window.NexusAPI;
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const CFG = window.NEXUS_CONFIG || {};
  const plug = (n) => (cap && cap.Plugins && cap.Plugins[n]) || null;

  /* ---------- armazenamento ---------- */
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const OLD_SYSTEM = "Você é a Nexus IA, uma assistente inteligente, rápida e direta. Responda no mesmo idioma do usuário (por padrão português do Brasil). Seja clara e bem organizada. Quando enviar código, use blocos de código markdown com a linguagem indicada (```js, ```python, etc.) e explique de forma curta.";
  const DEFAULTS = {
    provider: "gemini", apiKey: "", model: "gemini-flash-latest", baseUrl: "", temperature: 0.7,
    system: API.ENGINE_PROMPT, codeOnly: false, fast: true,
    anim: true, bg: true, fontSize: 16, enterSend: !!(window.matchMedia && matchMedia("(pointer:fine)").matches),
  };

  let user = null, settings = { ...DEFAULTS }, chats = [], curId = null;
  let streaming = false, abortCtl = null;

  const K = { users: "nexus.users", session: "nexus.session", chats: (u) => "nexus.chats." + u, cfg: (u) => "nexus.settings." + u };
  let warnedFull = false;
  const saveChats = () => {
    if (ls.set(K.chats(user), chats)) return;
    if (!warnedFull) { warnedFull = true; toast("⚠️ Memória do app cheia: apague conversas antigas (☰ → lixeira) para continuar salvando.", 5000); }
  };
  const saveCfg = () => ls.set(K.cfg(user), settings);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- utilidades de UI ---------- */
  const EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const I = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10.1l12.5 1.9-12.5 1.9z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  };
  function toast(msg, ms) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, ms || 2600);
  }
  function modal({ title, text, input, ok, cancel, danger }) {
    return new Promise((res) => {
      const m = document.createElement("div"); m.className = "modal";
      m.innerHTML = '<div class="box"><h3></h3><p></p>' + (input != null ? '<input type="text">' : "") + '<div class="acts"></div></div>';
      $("h3", m).textContent = title || ""; const p = $("p", m); if (text) p.textContent = text; else p.remove();
      const inp = $("input", m); if (inp) inp.value = input;
      const acts = $(".acts", m);
      const b1 = document.createElement("button"); b1.className = "btn ghost"; b1.textContent = cancel || "Cancelar";
      const b2 = document.createElement("button"); b2.className = "btn" + (danger ? " danger" : ""); b2.textContent = ok || "OK";
      acts.append(b1, b2);
      const done = (v) => { m.remove(); res(v); };
      b1.onclick = () => done(inp ? null : false);
      b2.onclick = () => done(inp ? inp.value : true);
      m.addEventListener("click", (e) => { if (e.target === m) done(inp ? null : false); });
      m._close = () => done(inp ? null : false);
      document.body.appendChild(m);
      if (inp) { inp.focus(); inp.select(); }
    });
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0"; document.body.appendChild(ta);
      ta.focus(); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (e) { return false; }
  }
  async function saveTextFile(name, text) {
    const FS = plug("Filesystem");
    if (isNative && FS) {
      try {
        await FS.writeFile({ path: "NexusIA/" + name, data: text, directory: "DOCUMENTS", encoding: "utf8", recursive: true });
        toast("✅ Salvo em Documentos/NexusIA/" + name, 3800); return;
      } catch (e) { /* tenta compartilhar */ }
      try {
        const r = await FS.writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
        const Share = plug("Share");
        if (Share) { await Share.share({ title: name, url: r.uri, dialogTitle: "Salvar arquivo .txt" }); return; }
      } catch (e) { toast("Não consegui salvar o arquivo."); return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("⬇ Arquivo baixado: " + name);
  }
  const stamp = () => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);

  /* ---------- contas (login por e-mail e senha, local) ---------- */
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function hashPw(pw, saltB64) {
    const enc = new TextEncoder();
    if (window.crypto && crypto.subtle) {
      const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64(saltB64), iterations: 120000, hash: "SHA-256" }, key, 256);
      return b64(bits);
    }
    let h = 5381; const s = saltB64 + pw; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "x" + h;
  }
  const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

  let authMode = "login";
  function setAuthMode(mode) {
    authMode = mode;
    $("#authTabs").classList.toggle("reg", mode === "register");
    $$("#authTabs button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    $("#aPass2Wrap").classList.toggle("hidden", mode !== "register");
    $("#authBtn").textContent = mode === "register" ? "Criar conta" : "Entrar";
    $("#authSub").textContent = mode === "register" ? "Crie sua conta e comece a conversar" : "Entre para acordar o rei das IAs";
    $("#aPass").autocomplete = mode === "register" ? "new-password" : "current-password";
    $("#authErr").textContent = "";
  }
  function authError(msg) {
    $("#authErr").textContent = msg;
    const c = $("#authCard"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
  }
  async function submitAuth(e) {
    e.preventDefault();
    const email = $("#aEmail").value.trim().toLowerCase(), pass = $("#aPass").value;
    if (!validEmail(email)) return authError("Digite um e-mail válido.");
    if (!pass) return authError("Digite a senha.");
    const users = ls.get(K.users, {});
    const btn = $("#authBtn"); btn.disabled = true;
    try {
      if (authMode === "register") {
        if (pass.length < 6) return authError("A senha precisa ter pelo menos 6 caracteres.");
        if (pass !== $("#aPass2").value) return authError("As senhas não são iguais.");
        if (users[email]) return authError("Esse e-mail já tem conta. Toque em Entrar.");
        const salt = newSalt();
        users[email] = { salt, hash: await hashPw(pass, salt), created: Date.now() };
        ls.set(K.users, users);
      } else {
        const u = users[email];
        if (!u) return authError("Conta não encontrada. Toque em Criar conta.");
        if ((await hashPw(pass, u.salt)) !== u.hash) return authError("Senha incorreta.");
      }
      ls.set(K.session, email);
      $("#aPass").value = ""; $("#aPass2").value = "";
      enterApp(email);
    } finally { btn.disabled = false; }
  }

  /* ---------- entrar no app ---------- */
  function enterApp(email) {
    user = email;
    settings = { ...DEFAULTS, ...ls.get(K.cfg(user), {}) };
    // quem ainda usava a instrução antiga (nunca editada) passa a usar o motor de código
    if (!(settings.system || "").trim() || settings.system === OLD_SYSTEM) settings.system = DEFAULTS.system;
    if (CFG.apiKey && !(settings.apiKey || "").trim()) { // chave embutida no build
      settings.apiKey = CFG.apiKey;
      if (CFG.provider && API.PROVIDERS[CFG.provider]) { settings.provider = CFG.provider; settings.model = CFG.model || API.PROVIDERS[CFG.provider].model; }
      else if (CFG.model) settings.model = CFG.model;
      saveCfg();
    }
    chats = ls.get(K.chats(user), []);
    curId = null;
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#dUser").textContent = email;
    applyLook();
    renderHistory(); renderChat();
  }
  function leaveApp() {
    if (abortCtl) abortCtl.abort();
    ls.del(K.session); user = null; chats = []; curId = null;
    closeSettings(); closeDrawer();
    $("#app").classList.add("hidden"); $("#auth").classList.remove("hidden");
    setAuthMode("login");
  }
  function applyLook() {
    document.body.classList.toggle("no-anim", !settings.anim);
    $("#app").classList.toggle("nobg", !settings.bg);
    document.documentElement.style.setProperty("--fs", settings.fontSize + "px");
    $("#coBtn").classList.toggle("on", !!settings.codeOnly);
    $("#coBtn").setAttribute("aria-pressed", settings.codeOnly ? "true" : "false");
    $("#input").placeholder = settings.codeOnly ? "Code Only: descreva o que quer em código…" : "Pergunte qualquer coisa à Nexus…";
    const sc = $("#sCode"); if (sc) sc.checked = !!settings.codeOnly;
    const sf = $("#sFast"); if (sf) sf.checked = settings.fast !== false;
  }
  function setCodeOnly(on) {
    settings.codeOnly = !!on; saveCfg(); applyLook();
    toast(on ? "‹/› Code Only ligado: só código, sem conversa" : "Code Only desligado");
  }

  /* ---------- histórico ---------- */
  function cur() { return chats.find((c) => c.id === curId) || null; }
  function groupOf(ts) {
    const d = new Date(ts), n = new Date(); const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(n) - day(d)) / 864e5);
    return diff <= 0 ? "Hoje" : diff === 1 ? "Ontem" : diff <= 7 ? "Últimos 7 dias" : "Mais antigas";
  }
  function renderHistory() {
    const q = ($("#dSearch").value || "").trim().toLowerCase();
    const list = chats.slice().sort((a, b) => b.updated - a.updated).filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)));
    const box = $("#hist"); box.innerHTML = "";
    if (!list.length) { box.innerHTML = '<div class="h-empty">' + (q ? "Nenhuma conversa encontrada." : "💀 Nenhuma conversa ainda.<br>Mande a primeira mensagem!") + "</div>"; return; }
    let g = "", delay = 0;
    list.forEach((c) => {
      const gr = groupOf(c.updated);
      if (gr !== g) { g = gr; const h = document.createElement("div"); h.className = "h-group"; h.textContent = gr; box.appendChild(h); }
      const it = document.createElement("div"); it.className = "h-item" + (c.id === curId ? " on" : ""); it.style.animationDelay = Math.min(delay++ * 0.04, 0.5) + "s";
      it.innerHTML = '<button class="t"></button><button class="icon-btn" data-a="ren" aria-label="Renomear">' + I.pen + '</button><button class="icon-btn" data-a="del" aria-label="Apagar">' + I.trash + "</button>";
      $(".t", it).textContent = c.title;
      $(".t", it).onclick = () => { openChat(c.id); closeDrawer(); };
      $('[data-a="ren"]', it).onclick = async () => { const v = await modal({ title: "Renomear conversa", input: c.title, ok: "Salvar" }); if (v && v.trim()) { c.title = v.trim().slice(0, 80); saveChats(); renderHistory(); if (c.id === curId) $("#chatTitle").textContent = c.title; } };
      $('[data-a="del"]', it).onclick = async () => { if (await modal({ title: "Apagar conversa?", text: "“" + c.title + "” será apagada para sempre.", ok: "Apagar", danger: true })) { chats = chats.filter((x) => x.id !== c.id); saveChats(); if (curId === c.id) { curId = null; renderChat(); } renderHistory(); toast("Conversa apagada"); } };
      box.appendChild(it);
    });
  }
  function openChat(id) { if (streaming) stopStream(); curId = id; renderChat(); renderHistory(); }
  function newChat() { if (streaming) stopStream(); curId = null; renderChat(); renderHistory(); $("#input").focus(); }

  /* ---------- drawer / settings ---------- */
  const openDrawer = () => { $("#drawer").classList.add("on"); $("#scrim").classList.add("on"); };
  const closeDrawer = () => { $("#drawer").classList.remove("on"); if (!$("#settings").classList.contains("on")) $("#scrim").classList.remove("on"); };
  function openSettings(tab) {
    fillSettings(); selectTab(tab || "ia");
    $("#settings").classList.add("on"); closeDrawer();
  }
  function closeSettings() { $("#settings").classList.remove("on"); $("#scrim").classList.remove("on"); }
  function selectTab(t) {
    $$("#sTabs button").forEach((b) => b.classList.toggle("on", b.dataset.s === t));
    $$(".s-sec").forEach((s) => s.classList.toggle("on", s.dataset.sec === t));
    $(".s-body").scrollTop = 0;
  }

  const MODELS = { gemini: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"], groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], openrouter: ["meta-llama/llama-3.3-70b-instruct:free"], openai: ["gpt-4o-mini", "gpt-4o"], custom: [] };
  function provUI() {
    const p = $("#sProv").value;
    $("#sBaseWrap").classList.toggle("hidden", p === "gemini");
    $("#sBase").placeholder = API.PROVIDERS[p].base || "https://api.exemplo.com/v1";
    $("#models").innerHTML = (MODELS[p] || []).map((m) => '<option value="' + m + '">').join("");
  }
  function fillSettings() {
    const sel = $("#sProv");
    if (!sel.options.length) Object.keys(API.PROVIDERS).forEach((k) => { const o = document.createElement("option"); o.value = k; o.textContent = API.PROVIDERS[k].name; sel.appendChild(o); });
    sel.value = settings.provider; provUI();
    $("#sKey").value = settings.apiKey; $("#sModel").value = settings.model; $("#sBase").value = settings.baseUrl;
    $("#sSys").value = settings.system; $("#sTemp").value = settings.temperature; $("#sTempV").textContent = tempLabel(settings.temperature);
    $("#sAnim").checked = settings.anim; $("#sBg").checked = settings.bg; $("#sEnter").checked = settings.enterSend;
    $("#sFs").value = settings.fontSize; $("#sFsV").textContent = settings.fontSize + " px";
    $("#pEmail").textContent = user; $("#sTestOut").textContent = ""; $("#pErr").textContent = "";
    $("#stChats").textContent = chats.length; $("#stMsgs").textContent = chats.reduce((n, c) => n + c.messages.length, 0);
  }
  const tempLabel = (t) => t + " — " + (t < 0.4 ? "preciso" : t < 1 ? "equilibrado" : "muito criativo");
  function bindSettings() {
    $("#sProv").onchange = () => {
      const p = $("#sProv").value; settings.provider = p; settings.model = API.PROVIDERS[p].model; settings.baseUrl = "";
      $("#sModel").value = settings.model; $("#sBase").value = ""; provUI(); saveCfg();
    };
    $("#sKey").oninput = (e) => { settings.apiKey = e.target.value.trim(); saveCfg(); };
    $("#sPaste").onclick = async () => {
      try { const t = (await navigator.clipboard.readText()).trim(); if (!t) return toast("A área de transferência está vazia."); $("#sKey").value = t; settings.apiKey = t; saveCfg(); toast("🔑 Chave colada e salva. Toque em Testar conexão."); }
      catch (e) { toast("Sem permissão para colar. Cole manualmente no campo."); $("#sKey").focus(); }
    };
    $("#sModel").oninput = (e) => { settings.model = e.target.value.trim(); saveCfg(); };
    $("#sBase").oninput = (e) => { settings.baseUrl = e.target.value.trim(); saveCfg(); };
    $("#sSys").oninput = (e) => { settings.system = e.target.value; saveCfg(); };
    $("#sSysReset").onclick = () => { settings.system = DEFAULTS.system; $("#sSys").value = settings.system; saveCfg(); toast("Instrução do motor restaurada"); };
    $("#sCode").onchange = (e) => setCodeOnly(e.target.checked);
    $("#sFast").onchange = (e) => { settings.fast = e.target.checked; saveCfg(); };
    $("#coBtn").onclick = () => setCodeOnly(!settings.codeOnly);
    $("#sTemp").oninput = (e) => { settings.temperature = +e.target.value; $("#sTempV").textContent = tempLabel(settings.temperature); saveCfg(); };
    $("#sAnim").onchange = (e) => { settings.anim = e.target.checked; saveCfg(); applyLook(); };
    $("#sBg").onchange = (e) => { settings.bg = e.target.checked; saveCfg(); applyLook(); };
    $("#sEnter").onchange = (e) => { settings.enterSend = e.target.checked; saveCfg(); };
    $("#sFs").oninput = (e) => { settings.fontSize = +e.target.value; $("#sFsV").textContent = settings.fontSize + " px"; saveCfg(); applyLook(); };
    $("#sTest").onclick = async () => {
      const out = $("#sTestOut"); out.style.color = "#a98f92"; out.textContent = "Testando…";
      const t0 = performance.now();
      try {
        const txt = await API.streamChat({ settings: { ...settings, system: "", codeOnly: false }, messages: [{ role: "user", content: "Responda somente: OK" }], onToken() {} });
        out.style.color = "#4ade80"; out.textContent = "✅ Conectado! Resposta em " + Math.round(performance.now() - t0) + " ms: " + txt.trim().slice(0, 40);
      } catch (e) { out.style.color = "#ff6b76"; out.textContent = "❌ " + errText(e); }
    };
    $("#pChange").onclick = async () => {
      const err = $("#pErr"); err.style.color = "#ff6b76";
      const users = ls.get(K.users, {}), u = users[user];
      if (!u || (await hashPw($("#pOld").value, u.salt)) !== u.hash) return (err.textContent = "Senha atual incorreta.");
      if ($("#pNew").value.length < 6) return (err.textContent = "A nova senha precisa ter 6+ caracteres.");
      u.salt = newSalt(); u.hash = await hashPw($("#pNew").value, u.salt); ls.set(K.users, users);
      $("#pOld").value = ""; $("#pNew").value = ""; err.style.color = "#4ade80"; err.textContent = "✅ Senha alterada!";
    };
    $("#pLogout").onclick = leaveApp;
    $("#pDelete").onclick = async () => {
      if (!(await modal({ title: "Excluir conta?", text: "Sua conta, conversas e configurações serão apagadas deste aparelho. Não dá para desfazer.", ok: "Excluir tudo", danger: true }))) return;
      const users = ls.get(K.users, {}); delete users[user]; ls.set(K.users, users); ls.del(K.chats(user)); ls.del(K.cfg(user)); leaveApp(); toast("Conta excluída");
    };
    $("#dExport").onclick = () => {
      if (!chats.length) return toast("Nenhuma conversa para exportar.");
      const txt = chats.slice().sort((a, b) => a.updated - b.updated).map((c) => "=== " + c.title + " (" + new Date(c.updated).toLocaleString("pt-BR") + ") ===\n\n" + c.messages.map((m) => (m.role === "user" ? "VOCÊ" : "NEXUS IA") + ":\n" + m.content).join("\n\n") ).join("\n\n\n");
      saveTextFile("nexus-ia-historico-" + stamp() + ".txt", txt);
    };
    $("#dClear").onclick = async () => {
      if (!chats.length) return toast("Já está vazio.");
      if (await modal({ title: "Apagar tudo?", text: "Todas as " + chats.length + " conversas serão apagadas.", ok: "Apagar tudo", danger: true })) { chats = []; curId = null; saveChats(); renderHistory(); renderChat(); fillSettings(); toast("Histórico apagado"); }
    };
  }

  /* ---------- chat ---------- */
  const SUGGEST = [
    ["💻", "Criar projeto", "Crie um app de lista de tarefas completo em HTML, CSS e JavaScript, com tratamento de erros"],
    ["🐞", "Corrigir bug", "Vou colar um código com erro. Encontre o bug e devolva o código corrigido por inteiro."],
    ["🎮", "Script de jogo", "Crie um sistema de inventário completo em Luau para Roblox, com salvamento de dados"],
    ["🧠", "Explicar fácil", "Explique como funciona a inteligência artificial de um jeito simples"],
  ];
  function welcomeHTML() {
    return '<div class="welcome"><div class="logo-wrap"><span class="ring"></span><span class="ring r2"></span><img src="icon.png" alt=""></div>' +
      "<h2>Olá! Eu sou a <em>NEXUS IA</em></h2><p>Motor de código universal: qualquer linguagem, qualquer projeto, código completo. Ligue o <b>CODE ONLY</b> para receber só o código.</p>" +
      ((settings.apiKey || "").trim() ? "" : '<button class="keybanner" id="keyBanner">🔑 Falta a chave de API. Toque aqui para colar</button>') +
      '<div class="chips">' + SUGGEST.map((s, i) => '<button class="chip" data-i="' + i + '"><b>' + s[0] + "</b>" + s[1] + "</button>").join("") + "</div></div>";
  }
  function renderChat() {
    const box = $("#chat"); box.innerHTML = ""; const c = cur();
    $("#chatTitle").textContent = c ? c.title : "Nova conversa";
    if (!c || !c.messages.length) { box.innerHTML = welcomeHTML(); $$(".chip", box).forEach((b) => (b.onclick = () => send(SUGGEST[+b.dataset.i][2])));
      const kb = $("#keyBanner"); if (kb) kb.onclick = () => { openSettings("ia"); setTimeout(() => $("#sKey").focus(), 400); };
      return; }
    c.messages.forEach((m, i) => addMsg(m.role, m.content, i === c.messages.length - 1));
    scrollEnd(true);
  }
  function botBubbleHTML() { return '<img class="avatar" src="icon.png" alt=""><div class="bubble"><div class="md"></div></div>'; }
  function addMsg(role, content, isLast) {
    const el = document.createElement("div"); el.className = "msg " + (role === "user" ? "user" : "bot");
    if (role === "user") { el.innerHTML = '<div class="bubble"></div>'; $(".bubble", el).textContent = content; }
    else { el.innerHTML = botBubbleHTML(); $(".md", el).innerHTML = MD.render(content); addActions(el, isLast); }
    $("#chat").appendChild(el); return el;
  }
  function addActions(el, isLast) {
    const old = $(".mactions", el); if (old) old.remove();
    const a = document.createElement("div"); a.className = "mactions";
    a.innerHTML = '<button data-m="copy">' + I.copy + " Copiar</button><button data-m=\"txt\">" + I.dl + " .txt</button>" + (isLast ? '<button data-m="redo">' + I.redo + " Refazer</button>" : "");
    $(".bubble", el).appendChild(a);
  }
  const nearBottom = () => { const c = $("#chat"); return c.scrollHeight - c.scrollTop - c.clientHeight < 140; };
  function scrollEnd(force) { const c = $("#chat"); if (force || stick) c.scrollTop = c.scrollHeight; }
  let stick = true;

  function setBusy(b) {
    streaming = b;
    const s = $("#sendBtn"); s.classList.toggle("stop", b); s.innerHTML = b ? I.stop : I.send; s.setAttribute("aria-label", b ? "Parar" : "Enviar");
    $("#ttl").classList.toggle("busy", b);
  }
  function stopStream() { if (abortCtl) abortCtl.abort(); }
  function errText(e) {
    if (!e) return "Erro desconhecido.";
    if (e.message === "NO_KEY") return "Nenhuma chave de API configurada.";
    if (e.name === "TypeError" || /Failed to fetch|NetworkError|Load failed/i.test(e.message)) return "Sem conexão com a internet (ou o servidor da IA está inacessível).";
    return e.message || String(e);
  }

  async function send(text, regen) {
    if (streaming) return;
    text = (text || "").trim(); if (!text && !regen) return;
    if (!(settings.apiKey || "").trim()) {
      toast("Cole sua chave de API primeiro 🔑", 3200);
      openSettings("ia"); setTimeout(() => $("#sKey").focus(), 500); return;
    }
    let c = cur();
    if (!regen) {
      if (!c) { c = { id: uid(), title: text.replace(/\s+/g, " ").slice(0, 42), updated: Date.now(), messages: [] }; chats.push(c); curId = c.id; $("#chat").innerHTML = ""; $("#chatTitle").textContent = c.title; }
      c.messages.push({ role: "user", content: text, ts: Date.now() }); c.updated = Date.now();
      addMsg("user", text);
      $("#input").value = ""; autosize();
      const sb = $("#sendBtn"); sb.classList.remove("fly"); void sb.offsetWidth; sb.classList.add("fly"); setTimeout(() => sb.classList.remove("fly"), 700);
    }
    // tira botões "refazer" antigos
    $$(".msg.bot .mactions [data-m=redo]").forEach((b) => b.remove());
    stick = true;
    const el = document.createElement("div"); el.className = "msg bot thinking"; el.innerHTML = botBubbleHTML();
    const md = $(".md", el); md.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    $("#chat").appendChild(el); scrollEnd(true); saveChats(); renderHistory();

    abortCtl = new AbortController(); setBusy(true);
    let acc = "", timer = null, first = true;
    const paint = () => { timer = null; md.innerHTML = MD.render(acc, true); md.classList.add("streaming-cursor"); scrollEnd(); };
    try {
      await API.streamChat({
        settings, signal: abortCtl.signal, onInfo: (m) => toast(m, 2600),
        messages: c.messages.map((m) => ({ role: m.role, content: m.content })),
        onToken(t) { acc += t; if (first) { first = false; el.classList.remove("thinking"); } if (!timer) timer = setTimeout(paint, Math.min(50 + acc.length / 30, 450)); }, // quanto maior o texto, mais espaçado o redesenho (evita travar)
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (e.name === "AbortError") { /* parou: mantém o que já veio */ }
      else {
        el.classList.remove("thinking");
        if (!acc) { $(".bubble", el).classList.add("err-b"); md.innerHTML = "⚠️ " + errText(e).replace(/</g, "&lt;"); addErrActions(el); setBusy(false); abortCtl = null; return; }
        toast("Conexão interrompida: " + errText(e), 4000);
      }
    }
    if (timer) clearTimeout(timer);
    el.classList.remove("thinking"); md.classList.remove("streaming-cursor");
    if (acc) { md.innerHTML = MD.render(acc); c.messages.push({ role: "assistant", content: acc, ts: Date.now() }); c.updated = Date.now(); addActions(el, true); }
    else el.remove();
    setBusy(false); abortCtl = null; saveChats(); renderHistory(); scrollEnd();
  }
  function addErrActions(el) {
    const a = document.createElement("div"); a.className = "mactions";
    a.innerHTML = '<button data-m="retry">' + I.redo + " Tentar de novo</button><button data-m=\"cfg\">⚙ Configurações</button>";
    $(".bubble", el).appendChild(a);
  }

  /* ---------- eventos ---------- */
  function autosize() { const t = $("#input"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 150) + "px"; }
  function bindChat() {
    const input = $("#input");
    input.addEventListener("input", autosize);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && settings.enterSend) { e.preventDefault(); send(input.value); } });
    $("#sendBtn").onclick = () => (streaming ? stopStream() : send(input.value));
    $("#menuBtn").onclick = openDrawer; $("#scrim").onclick = () => { closeDrawer(); if ($("#settings").classList.contains("on")) { /* mantém */ } else $("#scrim").classList.remove("on"); };
    $("#newBtn").onclick = newChat; $("#dNew").onclick = () => { newChat(); closeDrawer(); };
    $("#cfgBtn").onclick = () => openSettings(); $("#dCfg").onclick = () => openSettings();
    $("#sClose").onclick = closeSettings;
    $("#dSearch").oninput = renderHistory;
    $$("#sTabs button").forEach((b) => (b.onclick = () => selectTab(b.dataset.s)));
    const ch = $("#chat");
    ch.addEventListener("scroll", () => { stick = nearBottom(); $("#downBtn").classList.toggle("hidden", stick || ch.scrollHeight < ch.clientHeight * 1.3); });
    $("#downBtn").onclick = () => { stick = true; ch.scrollTop = ch.scrollHeight; };

    ch.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const msg = b.closest(".msg");
      // botões do bloco de código
      if (b.classList.contains("cbtn")) {
        const box = b.closest(".code"), code = $("pre", box).textContent, lang = ($(".lang", box).textContent || "codigo").replace(/[^\w#+.-]/g, "") || "codigo";
        if (b.dataset.act === "copy") {
          if (await copyText(code)) { b.classList.add("done"); const sp = $("span", b); sp.textContent = "Copiado!"; b.firstElementChild.outerHTML = I.check; setTimeout(() => { b.classList.remove("done"); const s = $("span", b); if (s) s.textContent = "Copiar"; b.firstElementChild.outerHTML = I.copy; }, 1800); }
          else toast("Não consegui copiar.");
        } else saveTextFile("nexus-" + lang + "-" + stamp() + ".txt", code);
        return;
      }
      // botões da mensagem
      const m = b.dataset.m; if (!m || !msg) return;
      const idx = $$(".msg.bot", ch).indexOf(msg);
      const botMsgs = (cur() || { messages: [] }).messages.filter((x) => x.role === "assistant");
      if (m === "copy") { const t = (botMsgs[idx] || {}).content || msg.textContent; toast((await copyText(t)) ? "✅ Resposta copiada" : "Não consegui copiar"); }
      else if (m === "txt") saveTextFile("nexus-resposta-" + stamp() + ".txt", (botMsgs[idx] || {}).content || msg.textContent);
      else if (m === "redo") { const c = cur(); if (c && c.messages.length && c.messages[c.messages.length - 1].role === "assistant") { c.messages.pop(); msg.remove(); send("", true); } }
      else if (m === "retry") { msg.remove(); send("", true); }
      else if (m === "cfg") openSettings("ia");
    });

    // botão voltar do Android
    const App = plug("App");
    if (App && App.addListener) App.addListener("backButton", () => {
      const mo = $$(".modal").pop();
      if (mo && mo._close) return mo._close();
      if ($("#settings").classList.contains("on")) return closeSettings();
      if ($("#drawer").classList.contains("on")) return closeDrawer();
      if (streaming) return stopStream();
      if (App.exitApp) App.exitApp();
    });
  }

  /* ---------- login: detalhes ---------- */
  function bindAuth() {
    $$(".eye").forEach((b) => { b.innerHTML = EYE; b.onclick = () => { const i = document.getElementById(b.dataset.eye); i.type = i.type === "password" ? "text" : "password"; b.style.color = i.type === "text" ? "var(--red-2)" : ""; }; });
    $$("#authTabs button").forEach((b) => (b.onclick = () => setAuthMode(b.dataset.mode)));
    $("#authCard").addEventListener("submit", submitAuth);
    const em = $("#embers");
    for (let i = 0; i < 22; i++) { const e = document.createElement("i"); const s = 3 + Math.random() * 6; e.style.cssText = "left:" + Math.random() * 100 + "%;width:" + s + "px;height:" + s + "px;animation-duration:" + (5 + Math.random() * 7) + "s;animation-delay:" + Math.random() * 8 + "s"; em.appendChild(e); }
  }

  /* ---------- proteção contra travamentos ---------- */
  let lastErrAt = 0;
  function softFail(msg) { const n = Date.now(); if (n - lastErrAt < 4000) return; lastErrAt = n; try { toast("⚠️ " + String(msg || "Erro inesperado").slice(0, 90), 3500); } catch (e) {} }
  window.addEventListener("error", (e) => { softFail(e.message); if (streaming && !abortCtl) setBusy(false); });
  window.addEventListener("unhandledrejection", (e) => { e.preventDefault && e.preventDefault(); softFail(e.reason && e.reason.message); });

  /* ---------- início ---------- */
  function init() {
    bindAuth(); bindSettings(); bindChat();
    const sess = ls.get(K.session, null), users = ls.get(K.users, {});
    setTimeout(() => {
      $("#splash").classList.add("out"); setTimeout(() => $("#splash").remove(), 700);
      if (sess && users[sess]) enterApp(sess); else $("#auth").classList.remove("hidden");
    }, 1700);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
