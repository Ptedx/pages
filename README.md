# pages

Coletânea de páginas HTML avulsas, publicada em **https://ptedx.github.io/pages/**.

## Como adicionar uma página nova

1. Coloque o arquivo `.html` na **raiz** do repositório (ex.: `minha-pagina.html`).
2. Abra `pages.js` e adicione um objeto no topo da lista `PAGES`:

   ```js
   {
     file: "minha-pagina.html",
     title: "Minha Página",
     desc: "Uma linha explicando do que se trata.",
     tags: ["categoria", "outra"],
     date: "2026-09-01",
     accent: "#15697F"
   },
   ```

3. `git add . && git commit -m "add minha-pagina" && git push`

O card aparece sozinho na grade, com preview ao vivo da própria página.
A URL fica em `https://ptedx.github.io/pages/minha-pagina.html`.

### Campos de `pages.js`

| campo    | obrigatório | o que é                                                            |
| -------- | ----------- | ------------------------------------------------------------------ |
| `file`   | sim         | caminho do `.html`, relativo ao `index.html`                        |
| `title`  | sim         | título do card                                                      |
| `desc`   | não         | descrição de uma linha                                              |
| `tags`   | não         | array de rótulos — viram chips de filtro automaticamente            |
| `date`   | não         | `"AAAA-MM-DD"`, só para exibição                                    |
| `thumb`  | não         | imagem de capa; sem ela, a página é renderizada ao vivo no card     |
| `accent` | não         | cor de destaque do card (qualquer valor CSS)                        |

## Dicas

- Nomes de arquivo em minúsculas, sem espaços nem acentos (`consorcio-x-financiamento.html`),
  já que viram URL.
- Subpastas funcionam: `file: "2026/experimento.html"`.
- Página muito pesada no preview? Gere um print e use `thumb: "thumbs/nome.png"`.
- `.nojekyll` está no repositório para o GitHub servir os arquivos como estão,
  sem passar pelo Jekyll.

## Rodando local

Abrir o `index.html` direto no navegador funciona, mas alguns navegadores bloqueiam
os previews em `file://`. Para ver igual ao ar:

```bash
python -m http.server 8000
# http://localhost:8000
```
