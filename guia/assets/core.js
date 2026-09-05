/* ===== núcleo: armazenamento, cliente Gemini, corpus, busca ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const store = {
  get(k, d = null) { try { const v = localStorage.getItem('guia.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('guia.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('guia.' + k); } catch {} },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 3) => (typeof n === 'number' && isFinite(n) ? n.toFixed(d) : '–');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Gemini ---------- */
const gemini = {
  base: 'https://generativelanguage.googleapis.com/v1beta',
  get key() { return store.get('key', ''); },
  set key(v) { store.set('key', v.trim()); },
  get model() { return store.get('model', 'gemini-2.5-flash'); },
  set model(v) { store.set('model', v); },
  get embedModel() { return store.get('embedModel', 'gemini-embedding-001'); },
  set embedModel(v) { store.set('embedModel', v); },
  dims: 768,
  ready() { return !!this.key; },
  timeoutMs: 90000,
  async req(path, body, method = 'POST') {
    if (!this.key) throw new Error('Sem chave da API. Configure na seção 1.');
    const url = `${this.base}/${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(this.key)}`;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let r;
    try { r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal }); }
    catch (e) { clearTimeout(timer); if (e.name === 'AbortError') throw new Error(`Sem resposta da API em ${this.timeoutMs / 1000}s (${path.split(':').pop()}). Tente outro modelo em "Listar modelos" ou verifique bloqueador/VPN do navegador.`); throw new Error('Falha de rede ao chamar a API: ' + e.message); }
    clearTimeout(timer);
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
    if (!r.ok) {
      const msg = j?.error?.message || txt.slice(0, 300);
      const e = new Error(`HTTP ${r.status}: ${msg}`); e.status = r.status; throw e;
    }
    return j;
  },
  async listModels() {
    const j = await this.req('models?pageSize=100', null, 'GET');
    return (j.models || []).map((m) => ({ id: m.name.replace(/^models\//, ''), methods: m.supportedGenerationMethods || [], display: m.displayName || '' }));
  },
  thinkingFor(model) {
    // modelos com "pensamento" gastam o orçamento de saída raciocinando; pedimos o mínimo.
    if (/gemini-3/.test(model)) return { thinkingLevel: 'LOW' };
    if (/gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
    return null;
  },
  async generate({ system, user, temperature = 0, json = true, schema = null, maxTokens = 2048, model = null, config = null, thinking = undefined }) {
    const m = model || this.model;
    const body = {
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    if (json && schema) body.generationConfig.responseSchema = schema;
    if (config) Object.assign(body.generationConfig, config);
    const th = thinking === undefined ? this.thinkingFor(m) : thinking; if (th && !this._noThink) body.generationConfig.thinkingConfig = th;
    const t0 = performance.now();
    let j;
    try { j = await this.req(`models/${m}:generateContent`, body); }
    catch (e) {
      // se o campo de pensamento não for aceito por este modelo, repete sem ele
      if (e.status === 400 && body.generationConfig.thinkingConfig && /think/i.test(e.message)) { delete body.generationConfig.thinkingConfig; this._noThink = true; j = await this.req(`models/${m}:generateContent`, body); }
      else throw e;
    }
    const cand = j.candidates?.[0];
    const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    const usage = j.usageMetadata || {};
    if (!text) {
      const why = cand?.finishReason === 'MAX_TOKENS' ? `o modelo esgotou maxOutputTokens (${maxTokens}) — ${usage.thoughtsTokenCount ? usage.thoughtsTokenCount + ' tokens foram gastos "pensando"' : 'aumente o limite'}` : j.promptFeedback?.blockReason ? 'bloqueado por segurança: ' + j.promptFeedback.blockReason : `finishReason=${cand?.finishReason || '?'}`;
      throw new Error('Resposta vazia: ' + why + '. Experimente outro modelo em "Listar modelos" (gemini-2.5-flash é o mais previsível para os exercícios).');
    }
    return { text, usage, finish: cand?.finishReason, ms: Math.round(performance.now() - t0), raw: j };
  },
  async embed(texts, taskType = 'RETRIEVAL_DOCUMENT', onProgress = null) {
    const out = []; const size = 16;
    for (let i = 0; i < texts.length; i += size) {
      const batch = texts.slice(i, i + size);
      const mk = (t) => ({ model: `models/${this.embedModel}`, content: { parts: [{ text: t }] }, taskType, outputDimensionality: this.dims });
      try {
        const j = await this.req(`models/${this.embedModel}:batchEmbedContents`, { requests: batch.map(mk) });
        for (const e of j.embeddings || []) out.push(normalize(e.values));
      } catch (e) {
        // fallback: uma por vez (alguns modelos/chaves não aceitam lote)
        for (const t of batch) { const j = await this.req(`models/${this.embedModel}:embedContent`, mk(t)); out.push(normalize(j.embedding.values)); }
      }
      onProgress && onProgress(Math.min(texts.length, i + size), texts.length);
    }
    if (out.length !== texts.length) throw new Error(`A API devolveu ${out.length} vetores para ${texts.length} textos.`);
    return out;
  },
  async countTokens(text, model = null) {
    const j = await this.req(`models/${model || this.model}:countTokens`, { contents: [{ parts: [{ text }] }] });
    return j.totalTokens ?? null;
  },
};

/* ---------- vetores ---------- */
function normalize(v) { const n = Math.hypot(...v) || 1; return v.map((x) => +(x / n).toFixed(6)); }
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function cosine(a, b) { return dot(a, b) / ((Math.hypot(...a) || 1) * (Math.hypot(...b) || 1)); }

/* ---------- corpus ---------- */
const corpus = {
  trechos: CORPUS.trechos,
  byId: Object.fromEntries(CORPUS.trechos.map((t) => [t.id, t])),
  avaliacao: CORPUS.avaliacao,
  get emb() { return store.get('emb.' + gemini.embedModel + '.' + gemini.dims, null); },
  set emb(v) { store.set('emb.' + gemini.embedModel + '.' + gemini.dims, v); },
  indexed() { const e = this.emb; return !!e && Object.keys(e).length === this.trechos.length; },
  async index(onProgress) {
    const texts = this.trechos.map((t) => `${t.dispositivo}. ${t.conteudo}`);
    const vecs = await gemini.embed(texts, 'RETRIEVAL_DOCUMENT', onProgress);
    const m = {}; this.trechos.forEach((t, i) => (m[t.id] = vecs[i]));
    this.emb = m; onProgress && onProgress(1);
    return m;
  },
};

/* ---------- busca lexical (BM25 simples, português) ---------- */
const STOP = new Set('a o os as um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre e ou que se ao à aos às este esta isto esse essa isso aquele aquela aquilo seu sua seus suas ser é são foi era será como mais menos muito já não sim quando onde qual quais cujo cuja'.split(' '));
function tokenize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9§]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w))
    .map(stem);
}
function stem(w) { // radicalização leve: plurais e algumas terminações
  if (w.length <= 3) return w;
  return w.replace(/(coes|oes)$/, 'ao').replace(/(ais|eis|ois)$/, 'al').replace(/(mente)$/, '').replace(/(s)$/, '').replace(/(ada|ado|idas|idos|ida|ido)$/, '');
}
const bm25 = {
  k1: 1.2, b: 0.75, docs: null, df: null, avgdl: 0,
  build() {
    this.docs = corpus.trechos.map((t) => ({ id: t.id, tf: count(tokenize(t.dispositivo + ' ' + t.conteudo)) }));
    this.df = {}; let total = 0;
    for (const d of this.docs) { d.len = Object.values(d.tf).reduce((a, b) => a + b, 0); total += d.len; for (const w in d.tf) this.df[w] = (this.df[w] || 0) + 1; }
    this.avgdl = total / this.docs.length;
  },
  search(q, k = 50) {
    if (!this.docs) this.build();
    const qs = tokenize(q); const N = this.docs.length; const res = [];
    for (const d of this.docs) {
      let s = 0;
      for (const w of qs) { const f = d.tf[w]; if (!f) continue; const idf = Math.log(1 + (N - this.df[w] + 0.5) / (this.df[w] + 0.5)); s += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * d.len / this.avgdl)); }
      if (s > 0) res.push({ id: d.id, score: s });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, k);
  },
};
function count(arr) { const m = {}; for (const w of arr) m[w] = (m[w] || 0) + 1; return m; }

/* ---------- busca vetorial e híbrida ---------- */
async function vectorSearch(q, k = 50) {
  if (!corpus.indexed()) throw new Error('Corpus ainda não indexado. Use "Indexar corpus" na seção 3.');
  const [qv] = await gemini.embed([q], 'RETRIEVAL_QUERY');
  const emb = corpus.emb;
  return corpus.trechos.map((t) => ({ id: t.id, score: dot(qv, emb[t.id]) })).sort((a, b) => b.score - a.score).slice(0, k);
}
function rrf(lists, K = 60, k = 12) {
  const acc = {};
  lists.forEach((list) => list.forEach((r, i) => { acc[r.id] = (acc[r.id] || 0) + 1 / (K + i + 1); }));
  return Object.entries(acc).map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score).slice(0, k);
}
async function hybridSearch(q, { K = 60, cand = 50, k = 12 } = {}) {
  const [v, l] = await Promise.all([vectorSearch(q, cand), Promise.resolve(bm25.search(q, cand))]);
  return { vetorial: v, lexical: l, hibrida: rrf([v, l], K, k) };
}

/* ---------- prompt: montagem e validação ---------- */
function buildContext(ids) {
  return ids.map((id) => { const t = corpus.byId[id]; return `<trecho id="${t.id}" dispositivo="${t.dispositivo}">\n${t.conteudo}\n</trecho>`; }).join('\n');
}
const RESP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    resposta: { type: 'STRING' },
    citacoes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, dispositivo: { type: 'STRING' } }, required: ['id', 'dispositivo'] } },
    sem_evidencia: { type: 'BOOLEAN' },
  },
  required: ['resposta', 'citacoes', 'sem_evidencia'],
};
function validateAnswer(obj, contextIds) {
  const motivos = { malformado: 0, fonte_inexistente: 0, fora_do_contexto: 0, sem_citacao: 0 };
  const citacoesOk = [];
  if (!obj || typeof obj !== 'object' || typeof obj.resposta !== 'string' || !Array.isArray(obj.citacoes)) { motivos.malformado++; return { ok: false, motivos, citacoesOk, resposta: null }; }
  for (const c of obj.citacoes) {
    if (!c || !corpus.byId[c.id]) { motivos.fonte_inexistente++; continue; }
    if (contextIds && !contextIds.includes(c.id)) { motivos.fora_do_contexto++; continue; }
    citacoesOk.push(c);
  }
  if (!obj.sem_evidencia && citacoesOk.length === 0) motivos.sem_citacao++;
  const ok = obj.sem_evidencia ? true : citacoesOk.length > 0;
  return { ok, motivos, citacoesOk, resposta: obj.resposta, sem_evidencia: !!obj.sem_evidencia };
}
function parseJSON(text) { try { return JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} } return null; } }

/* ---------- utilidades de UI ---------- */
function setStatus(el, msg, kind = '') { if (!el) return; el.textContent = msg; el.className = 'status ' + kind; }
function rankHTML(list, hits = []) {
  if (!list || !list.length) return '<p class="mini">Nenhum resultado.</p>';
  return '<ol class="rank">' + list.map((r, i) => { const t = corpus.byId[r.id]; return `<li class="${hits.includes(r.id) ? 'hit' : ''}"><span class="pos">${i + 1}</span><span><span class="id">${esc(r.id)}</span><br>${esc(t ? t.dispositivo : '')} · ${esc(t ? t.conteudo.slice(0, 90) : '')}…</span><span class="sc">${fmt(r.score, 3)}</span></li>`; }).join('') + '</ol>';
}
async function guard(statusEl, fn) {
  try { return await fn(); } catch (e) { setStatus(statusEl, (e && e.message) || String(e), 'err'); console.error(e); return null; }
}
