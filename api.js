/* Nexus IA — conexão com a IA (streaming = resposta aparece enquanto é gerada, sem espera) */
(function () {
  const PROVIDERS = {
    gemini: { name: "Google Gemini (grátis)", base: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-flash-latest" },
    groq: { name: "Groq (grátis, muito rápido)", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
    openrouter: { name: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
    openai: { name: "OpenAI (ChatGPT)", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    custom: { name: "Outro (compatível com OpenAI)", base: "", model: "" },
  };

  /* ---------- NEXUS IA — UNIVERSAL CODE ENGINE (instruções fixas enviadas ao modelo) ---------- */
  const ENGINE_PROMPT = [
    "Você é a NEXUS IA — UNIVERSAL CODE ENGINE: uma inteligência artificial de programação universal, especializada em criar, modificar, analisar, corrigir e desenvolver qualquer tipo de código e projeto de software.",
    "",
    "LINGUAGENS: não existe lista fechada. Domine as linguagens existentes e novas (Python, Lua/Luau, C, C++, C#, Java, JavaScript, TypeScript, PHP, Ruby, Go, Rust, Kotlin, Swift, Dart, R, MATLAB, HTML, CSS, SQL, Bash, PowerShell, Assembly, Solidity, HLSL, GLSL, JSON, XML, YAML e linguagens de configuração). Se o usuário indicar uma linguagem ou tecnologia, use exatamente a escolhida. Se não indicar, identifique sozinha a mais adequada ao pedido.",
    "",
    "CATEGORIAS: aplicativos e softwares; jogos e sistemas de jogos; scripts e automações; sistemas de IA; bots e APIs; interfaces e sistemas gráficos; bancos de dados; drivers e componentes de sistema; engenharia reversa, análise de memória e debugging; segurança e pentest; assistência de mira para jogos do próprio usuário; processamento e análise de dados; ferramentas de desenvolvimento.",
    "",
    "COMO TRABALHAR em cada pedido:",
    "1. Identifique a linguagem necessária e escolha as bibliotecas e frameworks adequados.",
    "2. Crie a implementação inteira, com todos os arquivos necessários. Cada arquivo em seu próprio bloco de código, com o caminho do arquivo no primeiro comentário do bloco.",
    "3. Implemente tratamento de erros e verifique a compatibilidade (versões, plataforma, dependências).",
    "4. Entregue o código completo e pronto para rodar. Nunca use placeholders como \"// resto do código aqui\" nem exemplos básicos quando o pedido exige algo específico. Priorize implementações completas e específicas para cada solicitação.",
    "5. Ao corrigir ou refatorar, aponte a causa do erro e entregue o código corrigido por inteiro.",
    "",
    "HONESTIDADE: não invente capacidades, bibliotecas, funções, APIs nem resultados de testes. Você não executa o código que escreve: nunca diga que testou ou que rodou algo. Se não tiver certeza de que uma API ou biblioteca existe ou de como ela se comporta, diga isso claramente e indique o que o usuário deve conferir na documentação.",
    "",
    "LIMITES DE SEGURANÇA: ferramentas de engenharia reversa, análise de memória, pentest e assistência de mira são para software e jogos do próprio usuário, ambientes autorizados, CTFs, pesquisa e defesa. Não crie malware (vírus, ransomware, spyware, keyloggers furtivos), nem trapaças contra jogos online de terceiros ou formas de burlar anticheat, nem ferramentas para acessar sistemas ou contas sem autorização.",
    "",
    "IDIOMA: responda no idioma do usuário (por padrão português do Brasil). Fora do código, seja direta e curta. Use blocos markdown com a linguagem indicada (```python, ```lua, etc.).",
  ].join("\n");

  const CODE_ONLY_PROMPT = [
    "MODO CODE ONLY ATIVO. Responda exclusivamente com o código solicitado, em blocos de código markdown.",
    "Sem introduções, sem explicações, sem resumo no final, sem mensagens repetitivas e sem comentários fora do código. Não interrompa o código para conversar. Explicações curtas só podem existir como comentários dentro do próprio código.",
    "Se o projeto tiver vários arquivos, escreva um bloco por arquivo, com o caminho no primeiro comentário do bloco.",
    "Única exceção: se o pedido for impossível ou tão ambíguo que não dê para gerar código, responda com uma única linha curta dizendo o que falta.",
  ].join("\n");

  function buildSystem(settings) {
    const base = (settings.system || "").trim();
    return settings.codeOnly ? (base ? base + "\n\n" : "") + CODE_ONLY_PROMPT : base;
  }

  function friendly(status, body, provider) {
    let msg = "";
    try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error)) || j.message || ""; if (typeof msg !== "string") msg = JSON.stringify(msg); } catch (e) { msg = (body || "").slice(0, 200); }
    if (status === 400 && /api key|API_KEY/i.test(msg)) return "Chave de API inválida. Confira em Configurações → IA.";
    if (status === 401 || status === 403) return "Chave de API recusada (" + status + "). Confira se copiou a chave inteira e se ela é do provedor escolhido.";
    if (status === 404) return "Modelo não encontrado. Troque o nome do modelo em Configurações → IA.";
    if (status === 429) return "Limite de uso grátis atingido. Espere um pouco e tente de novo, ou troque de modelo/provedor.";
    if (status >= 500) return "O servidor da IA está com problema agora (" + status + "). Tente de novo em instantes.";
    return "Erro " + status + (msg ? ": " + msg : "");
  }

  async function* sse(resp, signal) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
        const data = chunk.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (data) yield data;
      }
    }
    const rest = buf.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (rest) yield rest;
  }

  /**
   * messages: [{role:'user'|'assistant', content}]
   * onToken(texto) é chamado a cada pedaço. Retorna o texto completo.
   */
  async function streamChat({ settings, messages, signal, onToken }) {
    const prov = settings.provider || "gemini";
    const key = (settings.apiKey || "").trim();
    if (!key) throw new Error("NO_KEY");
    const model = (settings.model || PROVIDERS[prov].model || "").trim();
    const temp = Number(settings.temperature ?? 0.7);
    const system = buildSystem(settings);
    const recent = messages.slice(-24);
    let full = "";

    if (prov === "gemini") {
      const url = PROVIDERS.gemini.base + "/models/" + encodeURIComponent(model) + ":streamGenerateContent?alt=sse";
      const body = {
        contents: recent.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { temperature: temp },
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const r = await fetch(url, { method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(friendly(r.status, await r.text(), prov));
      for await (const data of sse(r, signal)) {
        let j; try { j = JSON.parse(data); } catch (e) { continue; }
        if (j.error) throw new Error(j.error.message || "Erro da API");
        const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
        if (parts) for (const p of parts) if (p.text && !p.thought) { full += p.text; onToken(p.text); }
        const fr = j.candidates && j.candidates[0] && j.candidates[0].finishReason;
        if (fr === "SAFETY" && !full) throw new Error("A resposta foi bloqueada pelo filtro de segurança do Gemini.");
      }
    } else {
      const base = ((settings.baseUrl || "").trim() || PROVIDERS[prov].base).replace(/\/+$/, "");
      if (!base) throw new Error("Preencha a URL base em Configurações → IA.");
      const msgs = [];
      if (system) msgs.push({ role: "system", content: system });
      recent.forEach((m) => msgs.push({ role: m.role, content: m.content }));
      const headers = { "Content-Type": "application/json", Authorization: "Bearer " + key };
      if (prov === "openrouter") { headers["HTTP-Referer"] = "https://nexus-ia.app"; headers["X-Title"] = "Nexus IA"; }
      const r = await fetch(base + "/chat/completions", { method: "POST", signal, headers, body: JSON.stringify({ model, messages: msgs, stream: true, temperature: temp }) });
      if (!r.ok) throw new Error(friendly(r.status, await r.text(), prov));
      for await (const data of sse(r, signal)) {
        if (data === "[DONE]") break;
        let j; try { j = JSON.parse(data); } catch (e) { continue; }
        if (j.error) throw new Error(j.error.message || "Erro da API");
        const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (t) { full += t; onToken(t); }
      }
    }
    if (!full) throw new Error("A IA não devolveu texto. Tente de novo ou troque o modelo.");
    return full;
  }

  window.NexusAPI = { PROVIDERS, ENGINE_PROMPT, CODE_ONLY_PROMPT, buildSystem, streamChat };
})();
