/* ---------------------------------------------------------------------------
   MANIFESTO DAS PÁGINAS
   ---------------------------------------------------------------------------
   Para publicar uma página nova:
     1. jogue o arquivo .html na raiz do repositório;
     2. adicione um objeto aqui em cima da lista (a ordem daqui é a da grade);
     3. commit + push. Pronto.

   Campos:
     file   (obrigatório) caminho do .html, relativo a este index
     title  (obrigatório) título curto que aparece no card
     desc   (opcional)    uma linha explicando a página
     tags   (opcional)    array de rótulos — viram filtros automaticamente
     date   (opcional)    "AAAA-MM-DD", só para exibição
     thumb  (opcional)    imagem de capa; se ausente, a própria página é
                          renderizada ao vivo dentro do card
     accent (opcional)    cor de destaque do card (qualquer valor CSS)
--------------------------------------------------------------------------- */

const PAGES = [
  {
    file: "consorcio-x-financiamento.html",
    title: "Consórcio × Financiamento",
    desc: "Simulador comparando as duas rotas para cartas de R$ 600 a 900 mil, com renda de R$ 13 a 25 mil.",
    tags: ["finanças", "simulador", "interativo"],
    date: "2026-08-29",
    accent: "#6E4A8E"
  }
];
