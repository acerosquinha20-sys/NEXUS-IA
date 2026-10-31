/* Nexus IA — markdown + colorização de código (sem dependências, funciona offline) */
(function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ---------------- colorização ---------------- */
  const W = (s) => s.trim().split(/\s+/);
  const KW = {
    js: W("break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await get set"),
    ts: W("break case catch class const continue default delete do else enum export extends finally for from function if implements import in instanceof interface let namespace new of private protected public readonly return static super switch this throw try type typeof var void while yield async await abstract as declare keyof"),
    py: W("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self cls"),
    java: W("abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits"),
    c: W("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template typename public private protected virtual override using new delete this try catch throw nullptr bool string vector include define"),
    cs: W("abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sbyte sealed short sizeof static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await record"),
    go: W("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var"),
    rs: W("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while"),
    kt: W("as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while by catch constructor delegate finally get import init set value companion data open override private protected public sealed suspend"),
    swift: W("as break case catch class continue default defer do else enum extension fallthrough false for func guard if import in init inout internal is let nil operator private protocol public repeat return self static struct subscript super switch throw throws true try typealias var where while async await"),
    php: W("abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while xor yield null true false"),
    rb: W("alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield puts require include extend attr_accessor"),
    sh: W("if then else elif fi for while until do done case esac function in select time echo cd ls export local return exit source alias unset set read test sudo apt pip npm git chmod mkdir rm cp mv cat grep sed awk"),
    sql: W("select from where and or not insert into values update set delete create table alter drop index join inner left right outer full on group by order having limit offset as distinct union all null is in like between exists primary key foreign references default unique check constraint view database begin commit rollback case when then else end count sum avg min max asc desc"),
    dart: W("abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in interface is late library mixin new null on operator part required rethrow return set show static super switch sync this throw true try typedef var void while with yield"),
    lua: W("and break do else elseif end false for function goto if in local nil not or repeat return then true until while"),
  };
  const ALIAS = { javascript: "js", jsx: "js", mjs: "js", node: "js", typescript: "ts", tsx: "ts", python: "py", python3: "py", py: "py", "c++": "c", cpp: "c", cc: "c", h: "c", hpp: "c", "c#": "cs", csharp: "cs", golang: "go", rust: "rs", kotlin: "kt", kts: "kt", ruby: "rb", bash: "sh", shell: "sh", zsh: "sh", sh: "sh", console: "sh", powershell: "sh", ps1: "sh", batch: "sh", mysql: "sql", postgres: "sql", postgresql: "sql", sqlite: "sql", plsql: "sql", yml: "yaml", htm: "html", xml: "html", svg: "html", vue: "html", jsonc: "json", scss: "css", sass: "css", less: "css" };

  function build(spec, flags) {
    return new RegExp(spec.map((s) => "(" + s[1] + ")").join("|"), flags || "g");
  }
  const NUM = "\\b(?:0x[\\da-fA-F]+|\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)\\b";
  const OP = "[+\\-*/%=<>!&|^~?:]+";
  const PUNCT = "[{}()\\[\\];,.]";

  function tokenize(code, spec, kwList, ci) {
    const kw = kwList ? "\\b(?:" + kwList.join("|") + ")\\b" : null;
    const full = spec.slice();
    // lugar do keyword: depois de string/comentário
    const rules = [];
    spec.forEach((s) => rules.push(s));
    if (kw) rules.push(["k", kw]);
    rules.push(["n", NUM]);
    rules.push(["f", "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()"]);
    rules.push(["t", "\\b[A-Z][A-Za-z0-9_]*\\b"]);
    rules.push(["o", OP]);
    rules.push(["p", PUNCT]);
    const re = build(rules, ci ? "gi" : "g");
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      if (m[0] === "") { re.lastIndex++; continue; }
      if (m.index > last) out += esc(code.slice(last, m.index));
      let cls = "p";
      for (let i = 0; i < rules.length; i++) if (m[i + 1] !== undefined) { cls = rules[i][0]; break; }
      out += '<span class="tk-' + cls + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  const STR = "\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'";
  const BT = "`(?:\\\\.|[^`\\\\])*`";
  const CL = ["c", "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)"];

  function hl(code, lang) {
    lang = (lang || "").toLowerCase();
    lang = ALIAS[lang] || lang;
    try {
      if (lang === "html") return hlHtml(code);
      if (lang === "css") return hlCss(code);
      if (lang === "json") return hlJson(code);
      if (lang === "yaml") return hlYaml(code);
      if (lang === "py") return tokenize(code, [["c", "#[^\\n]*"], ["s", "(?:[rbfRBF]{0,2})(?:\"\"\"[\\s\\S]*?(?:\"\"\"|$)|'''[\\s\\S]*?(?:'''|$))|(?:[rbfRBF]{0,2})(?:" + STR + ")"], ["d", "@[A-Za-z_][\\w.]*"]], KW.py);
      if (lang === "sh") return tokenize(code, [["c", "#[^\\n]*"], ["s", STR], ["v", "\\$\\{?[A-Za-z_]\\w*\\}?|\\$\\(|\\$[0-9@#?]"], ["d", "(?:^|\\s)--?[A-Za-z][\\w-]*"]], KW.sh);
      if (lang === "rb") return tokenize(code, [["c", "#[^\\n]*"], ["s", STR], ["v", "[@:]{1,2}[A-Za-z_]\\w*"]], KW.rb);
      if (lang === "sql") return tokenize(code, [["c", "--[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)"], ["s", "'(?:''|[^'])*'|\"[^\"]*\""]], KW.sql, true);
      if (lang === "lua") return tokenize(code, [["c", "--\\[\\[[\\s\\S]*?(?:\\]\\]|$)|--[^\\n]*"], ["s", STR]], KW.lua);
      if (lang === "php") return tokenize(code, [["c", "\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)"], ["s", STR], ["v", "\\$[A-Za-z_]\\w*"]], KW.php);
      if (KW[lang]) {
        const spec = [CL, ["s", STR + "|" + BT], ["d", "@[A-Za-z_][\\w.]*|#\\s*(?:include|define|import|pragma)\\b[^\\n]*"]];
        if (lang === "js" || lang === "ts") spec.push(["v", "\\$[A-Za-z_]\\w*"]);
        return tokenize(code, spec, KW[lang]);
      }
      // linguagem desconhecida: heurística genérica
      return tokenize(code, [["c", "\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)"], ["s", STR + "|" + BT]], null);
    } catch (e) {
      return esc(code);
    }
  }

  function hlHtml(code) {
    const re = /(<!--[\s\S]*?(?:-->|$))|(<\/?)([A-Za-z][\w:-]*)((?:\s+[^\s=<>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?>)|(<!DOCTYPE[^>]*>)/gi;
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      if (m.index > last) out += esc(code.slice(last, m.index));
      if (m[1]) out += '<span class="tk-c">' + esc(m[1]) + "</span>";
      else if (m[6]) out += '<span class="tk-d">' + esc(m[6]) + "</span>";
      else {
        out += '<span class="tk-p">' + esc(m[2]) + '</span><span class="tk-tag">' + esc(m[3]) + "</span>";
        out += (m[4] || "").replace(/(\s+)([^\s=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g, (_, sp, name, eq, val) =>
          esc(sp) + '<span class="tk-a">' + esc(name) + "</span>" + (eq ? '<span class="tk-o">' + esc(eq) + '</span><span class="tk-s">' + esc(val) + "</span>" : ""));
        out += '<span class="tk-p">' + esc(m[5]) + "</span>";
      }
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  function hlCss(code) {
    const re = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(@[\w-]+)|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|([\w-]+)(?=\s*:)|([.#][\w-]+|[a-zA-Z][\w-]*(?=\s*[{,:>+~ ]))|([{}();:,])/g;
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      if (m.index > last) out += esc(code.slice(last, m.index));
      const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "d" : m[4] ? "n" : m[5] ? "pr" : m[6] ? "t" : "p";
      out += '<span class="tk-' + cls + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  function hlJson(code) {
    const re = /("(?:\\.|[^"\\\n])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],])/g;
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      if (m.index > last) out += esc(code.slice(last, m.index));
      if (m[1]) out += '<span class="tk-' + (m[2] ? "pr" : "s") + '">' + esc(m[1]) + "</span>" + (m[2] ? '<span class="tk-p">' + esc(m[2]) + "</span>" : "");
      else out += '<span class="tk-' + (m[3] ? "k" : m[4] ? "n" : "p") + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  function hlYaml(code) {
    return code.split("\n").map((ln) => {
      if (/^\s*#/.test(ln)) return '<span class="tk-c">' + esc(ln) + "</span>";
      const m = ln.match(/^(\s*-?\s*)([\w.\-"']+)(\s*:)(.*)$/);
      if (m) {
        let v = esc(m[4]);
        v = v.replace(/(&quot;[^&]*?&quot;|'[^']*')/g, '<span class="tk-s">$1</span>').replace(/\b(true|false|null)\b/g, '<span class="tk-k">$1</span>').replace(/(^|\s)(-?\d+(?:\.\d+)?)(?=\s|$)/g, '$1<span class="tk-n">$2</span>');
        return esc(m[1]) + '<span class="tk-pr">' + esc(m[2]) + '</span><span class="tk-p">' + esc(m[3]) + "</span>" + v;
      }
      return esc(ln).replace(/^(\s*-\s)/, '<span class="tk-o">$1</span>');
    }).join("\n");
  }

  /* ---------------- markdown ---------------- */
  const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/></svg>';

  function inline(t) {
    const codes = [];
    t = t.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    t = esc(t);
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>");
    t = t.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>").replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>");
    t = t.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code class="ic">' + esc(codes[+i]) + "</code>");
    return t;
  }

  const hlCache = new Map();
  function hlCached(code, lang) {
    const k = lang + "\u0001" + code;
    let v = hlCache.get(k);
    if (v === undefined) { v = hl(code, lang); hlCache.set(k, v); if (hlCache.size > 60) hlCache.delete(hlCache.keys().next().value); }
    return v;
  }
  function codeBlock(lang, code, plain) {
    const label = lang || "código";
    return '<div class="code"><div class="code-head"><span class="dots"><i></i><i></i><i></i></span><span class="lang">' + esc(label) +
      '</span><button class="cbtn" data-act="copy">' + ICON_COPY + '<span>Copiar</span></button>' +
      '<button class="cbtn" data-act="dl">' + ICON_DL + '<span>.txt</span></button></div>' +
      '<pre><code>' + (plain ? esc(code) : hlCached(code, lang)) + "</code></pre></div>";
  }

  function render(src, streaming) {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let html = "", i = 0, para = [];
    const flush = () => { if (para.length) { html += "<p>" + inline(para.join("\n")).replace(/\n/g, "<br>") + "</p>"; para = []; } };
    while (i < lines.length) {
      const ln = lines[i];
      let m;
      if ((m = ln.match(/^\s*(```+|~~~+)\s*([\w#+.\-]*)[^\n]*$/))) {
        flush();
        const fence = m[1][0], lang = m[2], buf = [];
        i++;
        while (i < lines.length && !new RegExp("^\\s*" + fence + "{3,}\\s*$").test(lines[i])) buf.push(lines[i++]);
        const closed = i < lines.length;
        i++; // fecha
        html += codeBlock(lang, buf.join("\n"), streaming && !closed); // bloco ainda aberto: sem colorir (rápido)
        continue;
      }
      if (/^\s*$/.test(ln)) { flush(); i++; continue; }
      if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { flush(); html += "<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"; i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)) { flush(); html += "<hr>"; i++; continue; }
      if (/^\s*>/.test(ln)) { flush(); const b = []; while (i < lines.length && /^\s*>/.test(lines[i])) b.push(lines[i++].replace(/^\s*>\s?/, "")); html += "<blockquote>" + inline(b.join("\n")).replace(/\n/g, "<br>") + "</blockquote>"; continue; }
      if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        flush();
        const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const head = cells(ln); i += 2; const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        html += '<div class="tbl"><table><thead><tr>' + head.map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>" + rows.map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(ln)) {
        flush();
        const ordered = /^\s*\d/.test(ln); const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          let it = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""); i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) it += "\n" + lines[i++].trim();
          items.push(it);
        }
        html += (ordered ? "<ol>" : "<ul>") + items.map((x) => "<li>" + inline(x).replace(/\n/g, "<br>") + "</li>").join("") + (ordered ? "</ol>" : "</ul>");
        continue;
      }
      para.push(ln); i++;
    }
    flush();
    return html;
  }

  window.NexusMD = { render, highlight: hl };
})();
