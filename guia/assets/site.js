/* ===== comportamento compartilhado das páginas do guia ===== */
(function () {
  const root = document.documentElement;
  const M = window.GUIA_MANIFEST || { pages: [] };
  const PAGE = document.body.dataset.page || '';

  /* tema */
  const saved = store.get('theme');
  if (saved) root.setAttribute('data-theme', saved);
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) root.setAttribute('data-theme', 'dark');
  const tbtn = $('#theme');
  const syncTheme = () => { const dark = root.getAttribute('data-theme') === 'dark'; tbtn.textContent = dark ? 'Tema claro' : 'Tema escuro'; tbtn.setAttribute('aria-pressed', String(dark)); };
  tbtn.addEventListener('click', () => { const dark = root.getAttribute('data-theme') === 'dark'; root.setAttribute('data-theme', dark ? 'light' : 'dark'); store.set('theme', dark ? 'light' : 'dark'); syncTheme(); });
  syncTheme();

  /* gaveta de navegação (mobile) */
  const nav = $('nav.side'), scrim = $('.scrim'), mbtn = $('#menu');
  const closeNav = () => { nav.classList.remove('open'); scrim.classList.remove('on'); mbtn.setAttribute('aria-expanded', 'false'); };
  mbtn.addEventListener('click', () => { const open = nav.classList.toggle('open'); scrim.classList.toggle('on', open); mbtn.setAttribute('aria-expanded', String(open)); });
  scrim.addEventListener('click', closeNav);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

  /* progresso por capítulo */
  const chapters = $$('section.chapter[data-ch]');
  function doneMap() { return store.get('done', {}); }
  function renderProgress() {
    const done = doneMap();
    // página atual
    chapters.forEach((s) => { const cb = $('input[data-done]', s); if (cb) cb.checked = !!done[s.dataset.ch]; const a = $(`aside.toc a[href="#${s.id}"] .ok`); if (a) a.textContent = done[s.dataset.ch] ? '✓' : ''; });
    // global
    let total = 0, n = 0;
    M.pages.forEach((p) => { (p.chapters || []).forEach((c) => { total++; if (done[c]) n++; }); const li = $(`nav.side a[data-page="${p.id}"] .done-mark`); if (li) { const pn = (p.chapters || []).filter((c) => done[c]).length; li.textContent = p.chapters && p.chapters.length ? (pn === p.chapters.length ? '✓' : pn ? `${pn}/${p.chapters.length}` : '') : ''; } });
    const pct = total ? Math.round((n / total) * 100) : 0;
    const pt = $('#prog-text'); if (pt) pt.textContent = `${n} de ${total} capítulos concluídos`;
    const pb = $('#prog-bar'); if (pb) { pb.style.width = pct + '%'; pb.parentElement.setAttribute('aria-valuenow', String(pct)); }
  }
  $$('input[data-done]').forEach((i) => i.addEventListener('change', () => { const d = doneMap(); const ch = i.closest('section.chapter').dataset.ch; d[ch] = i.checked; store.set('done', d); renderProgress(); }));

  /* sumário da página (menu da direita + seletor inline) */
  const toc = $('#toc-list'), sel = $('#toc-select');
  if (toc) {
    chapters.forEach((s) => { const h = $('h2', s); const li = document.createElement('li'); li.innerHTML = `<a href="#${s.id}">${esc(h ? h.textContent : s.id)}<span class="ok"></span></a>`; toc.appendChild(li); if (sel) sel.add(new Option(h ? h.textContent : s.id, '#' + s.id)); });
    if (sel) sel.addEventListener('change', () => { if (sel.value) location.hash = sel.value; sel.value = ''; });
    const links = $$('aside.toc a');
    const io = new IntersectionObserver((entries) => { entries.forEach((en) => { if (en.isIntersecting) { links.forEach((a) => a.removeAttribute('aria-current')); const a = links.find((l) => l.getAttribute('href') === '#' + en.target.id); if (a) a.setAttribute('aria-current', 'true'); } }); }, { rootMargin: '-15% 0px -70% 0px' });
    chapters.forEach((s) => io.observe(s));
  }
  renderProgress();

  /* caderno: anotações por capítulo */
  $$('.notes textarea[data-note]').forEach((ta) => {
    const k = 'note.' + ta.dataset.note; ta.value = store.get(k, ''); const saved = ta.parentElement.querySelector('.saved');
    let t; ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { store.set(k, ta.value); if (saved) saved.textContent = 'salvo neste navegador · ' + new Date().toLocaleTimeString('pt-BR'); }, 400); });
    if (ta.value && saved) saved.textContent = 'salvo neste navegador';
  });

  /* autoavaliação */
  $$('.quiz').forEach((q) => {
    const btn = $('button.grade', q); if (!btn) return;
    btn.addEventListener('click', () => {
      let ok = 0; const fs = $$('fieldset', q);
      fs.forEach((f) => { const chosen = $('input:checked', f); $$('label.opt', f).forEach((l) => { l.classList.remove('right', 'wrong'); const inp = $('input', l); if (inp.dataset.correct === '1') l.classList.add('right'); else if (inp.checked) l.classList.add('wrong'); }); if (chosen && chosen.dataset.correct === '1') ok++; });
      q.classList.add('graded');
      const sc = $('.score', q); if (sc) sc.textContent = `${ok} de ${fs.length} corretas. ${ok === fs.length ? 'Domínio confirmado.' : ok >= fs.length * 0.7 ? 'Bom; releia os capítulos das erradas.' : 'Vale reler a página antes de seguir.'}`;
      store.set('quiz.' + PAGE, { ok, total: fs.length, when: Date.now() });
    });
    const prev = store.get('quiz.' + PAGE); if (prev) { const sc = $('.score', q); if (sc) sc.textContent = `Última tentativa: ${prev.ok} de ${prev.total}.`; }
  });

  /* botões de copiar */
  $$('pre').forEach((pre) => { const b = document.createElement('button'); b.className = 'copy'; b.type = 'button'; b.textContent = 'Copiar'; b.setAttribute('aria-label', 'Copiar código'); b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(pre.querySelector('code').innerText); b.textContent = 'Copiado'; setTimeout(() => (b.textContent = 'Copiar'), 1500); } catch { b.textContent = 'Selecione e copie'; } }); pre.appendChild(b); });

  /* diagramas passo a passo: legendas em data-caps (JSON) na figure */
  $$('[data-stepper]').forEach((btn) => {
    const key = btn.dataset.stepper; const fig = btn.closest('figure'); const stages = $$(`[data-stage^="${key}-"]`, fig); const cap = $(`#${key}-cap`);
    let caps = []; try { caps = JSON.parse(fig.dataset.caps || '[]'); } catch {}
    let i = -1; const all = () => stages.forEach((s) => s.classList.add('on'));
    const apply = () => { stages.forEach((s, j) => s.classList.toggle('on', j <= i)); if (cap) cap.textContent = i >= 0 ? `${i + 1}/${stages.length} · ${caps[i] || ''}` : ''; btn.textContent = i >= stages.length - 1 ? 'Recomeçar' : (i < 0 ? 'Passo a passo' : 'Próximo passo'); };
    all(); btn.addEventListener('click', () => { i = i >= stages.length - 1 ? 0 : i + 1; apply(); });
    const r = $(`[data-stepper-reset="${key}"]`, fig); if (r) r.addEventListener('click', () => { i = -1; all(); if (cap) cap.textContent = ''; btn.textContent = 'Passo a passo'; });
  });

  /* painel de chave (só existe no início, mas o status aparece em toda página) */
  const kStatus = $('#k-status');
  function keyBanner() { const b = $('#keybanner'); if (!b) return; b.hidden = gemini.ready(); }
  keyBanner();
  if ($('#k-key')) {
    const kKey = $('#k-key'), kModel = $('#k-model'), kEmbed = $('#k-embed');
    function syncKeyUI() {
      kKey.value = gemini.key; kModel.value = gemini.model; kEmbed.value = gemini.embedModel;
      if (![...kModel.options].some((o) => o.value === gemini.model)) kModel.add(new Option(gemini.model, gemini.model, true, true));
      if (![...kEmbed.options].some((o) => o.value === gemini.embedModel)) kEmbed.add(new Option(gemini.embedModel, gemini.embedModel, true, true));
      setStatus(kStatus, gemini.ready() ? `Chave configurada. Geração: ${gemini.model} · embeddings: ${gemini.embedModel}.` : 'Sem chave configurada. Os experimentos ao vivo ficam desativados; os de brinquedo funcionam normalmente.', gemini.ready() ? 'ok' : '');
      keyBanner();
    }
    $('#k-save').addEventListener('click', () => guard(kStatus, async () => { gemini.key = kKey.value; gemini.model = kModel.value; gemini.embedModel = kEmbed.value; if (!gemini.ready()) { syncKeyUI(); return; } setStatus(kStatus, 'Testando…'); const r = await gemini.generate({ user: 'Responda apenas com a palavra OK.', json: false, maxTokens: 256 }); syncKeyUI(); setStatus(kStatus, `Funcionou (${r.ms} ms). Geração: ${gemini.model} · embeddings: ${gemini.embedModel}. Resposta: ${r.text.trim().slice(0, 40)}`, 'ok'); }));
    $('#k-clear').addEventListener('click', () => { gemini.key = ''; syncKeyUI(); });
    $('#k-list').addEventListener('click', () => guard(kStatus, async () => {
      gemini.key = kKey.value; if (!gemini.ready()) throw new Error('Cole a chave primeiro.'); setStatus(kStatus, 'Consultando modelos…');
      const ms = await gemini.listModels(); const gen = ms.filter((m) => m.methods.includes('generateContent')); const emb = ms.filter((m) => m.methods.includes('embedContent'));
      kModel.innerHTML = ''; gen.forEach((m) => kModel.add(new Option(m.id, m.id))); kEmbed.innerHTML = ''; emb.forEach((m) => kEmbed.add(new Option(m.id, m.id)));
      const pref = gen.find((m) => m.id === 'gemini-2.5-flash') || gen.find((m) => /flash-lite/.test(m.id) && !/image|tts|live|audio/.test(m.id)) || gen.find((m) => /flash/.test(m.id) && !/image|tts|live|audio/.test(m.id)) || gen[0]; if (pref) kModel.value = pref.id;
      const epref = emb.find((m) => m.id === gemini.embedModel) || emb[0]; if (epref) kEmbed.value = epref.id;
      setStatus(kStatus, `${gen.length} modelos de geração e ${emb.length} de embeddings disponíveis. Escolha e clique em "Salvar e testar".`, 'ok');
    }));
    $('#k-diag').addEventListener('click', () => guard(kStatus, async () => {
      gemini.key = kKey.value; if (!gemini.ready()) throw new Error('Cole a chave primeiro.');
      const lines = []; const t = async (nome, fn) => { const t0 = performance.now(); try { const r = await fn(); lines.push(`${nome}: ok em ${Math.round(performance.now() - t0)} ms${r ? ' · ' + r : ''}`); } catch (e) { lines.push(`${nome}: FALHOU após ${Math.round(performance.now() - t0)} ms · ${e.message}`); } setStatus(kStatus, lines.join(' | ')); };
      await t('listar modelos', async () => (await gemini.listModels()).length + ' modelos');
      await t(`gerar (${gemini.model})`, async () => { const r = await gemini.generate({ user: 'Diga apenas: pronto', json: false, maxTokens: 256 }); return `"${r.text.trim().slice(0, 30)}" · ${r.usage.totalTokenCount ?? '?'} tokens`; });
      await t(`gerar JSON (${gemini.model})`, async () => { const r = await gemini.generate({ user: 'Devolva um JSON {"ok": true}', json: true, maxTokens: 256 }); return r.text.trim().slice(0, 30); });
      await t(`embedding (${gemini.embedModel})`, async () => { const [v] = await gemini.embed(['teste de vetor'], 'SEMANTIC_SIMILARITY'); return v.length + ' dimensões'; });
      setStatus(kStatus, lines.join(' | '), lines.some((l) => /FALHOU/.test(l)) ? 'err' : 'ok');
    }));
    kModel.addEventListener('change', () => { gemini.model = kModel.value; syncKeyUI(); });
    kEmbed.addEventListener('change', () => { gemini.embedModel = kEmbed.value; syncKeyUI(); });
    syncKeyUI();
  }

  /* glossário com filtro (quando existir) */
  const gq = $('#gl-q');
  if (gq) { const items = $$('#gl-list li'); const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); const f = () => { const q = norm(gq.value || ''); items.forEach((li) => (li.hidden = !!q && !norm(li.textContent).includes(q))); }; gq.addEventListener('input', f); }
})();
