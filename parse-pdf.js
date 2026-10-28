// Lê relatórios de vendas do STI3 em PDF e devolve [{ nome, qtd }].
//
// Funciona com os dois formatos que o sistema gera:
//   - Saborei: "Totalização de Produtos por Venda Agrupado" (com código na frente)
//   - Holy Burger: "Vendas totalizadas por produtos" (sem código, com subtotal por categoria)
//
// Em vez de depender do texto "corrido" do PDF (que cola as colunas), usa a
// posição de cada pedaço de texto: tudo que está na mesma altura vira uma linha,
// ordenada da esquerda pra direita. Aí o nome é o que sobra antes dos dois
// últimos números (quantidade e valor).
// O pdf.js avisa que não achou o módulo opcional "canvas" (só serve pra desenhar
// o PDF, que não fazemos). Silenciamos só esse aviso durante o carregamento.
const _warn = console.warn, _log = console.log;
const _filtro = (orig) => (...a) => { if (!String(a[0]).includes("polyfill")) orig(...a); };
console.warn = _filtro(_warn);
console.log = _filtro(_log);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
console.warn = _warn;
console.log = _log;

const SKIP_PREFIXES = [
  "categoria", "total", "acréscimos", "acrescimos", "descontos", "pág", "pag.",
  "período", "periodo", "saborei", "saborey", "holy burger", "vendas totalizadas",
  "totalização", "totalizacao", "produto", "quantidade", "valor", "impresso",
];

// Quantidade e valor sempre vêm com 2 casas decimais ("3,00", "1.250,00").
// Isso diferencia dos números que fazem parte do nome (ex.: "Água 1,5L").
const NUM = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2}";
const LINE_RE = new RegExp(`^(?:\\d+\\s+)?(.+?)\\s+(${NUM})\\s+(${NUM})\\s*$`);

function parseNum(s) {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

// Agrupa os pedaços de texto de uma página em linhas (mesma altura = mesma linha).
function pageToLines(items) {
  const rows = [];
  for (const it of items) {
    const str = it.str;
    if (!str || !str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, str });
  }
  rows.sort((a, b) => b.y - a.y); // de cima pra baixo
  return rows.map((r) =>
    r.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join(" ").replace(/\s+/g, " ").trim()
  );
}

function parseVendasLines(lines) {
  const itens = [];
  for (const line of lines) {
    if (!line) continue;
    const low = line.toLowerCase();
    if (SKIP_PREFIXES.some((p) => low.startsWith(p))) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const nome = m[1].trim();
    // Linha de subtotal de categoria, ex.: "Cervejas Total: 24,00 235,00"
    if (!nome || /\btotal\b\s*:?/i.test(nome)) continue;
    const qtd = parseNum(m[2]);
    if (!isNaN(qtd) && qtd > 0) itens.push({ nome, qtd });
  }
  return itens;
}

async function parseVendasPdf(buffer) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...pageToLines(content.items));
  }
  return parseVendasLines(lines);
}

module.exports = { parseVendasPdf, parseVendasLines };
