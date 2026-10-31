const crypto = require("crypto");

function normaliza(s) {
  return (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function slugify(s) {
  return normaliza(s).replace(/\s+/g, "-");
}

// A quantidade é o último número do item ("Heineken 24" ou "Heineken: 24").
// Só separa depois dela, porque nomes têm vírgula ("Água 1,5L")
// e quantidades também ("Chopp: 1,5"). Vírgula colada num dígito é decimal.
const SEPARADOR_ENTRADA = /(?<=[:\s][+-]?\d+(?:[.,]\d+)?)\s*(?:[;\n]+|,(?!\d))\s*/;
const ITEM_ENTRADA = /^(.+?)(?:\s*:\s*|\s+)\+?(\d+(?:[.,]\d+)?)$/;

// Devolve [{ nome, qtd }]; o que não for uma quantidade positiva vem como
// { invalido: "texto original" }.
function parseEntrada(texto) {
  return texto.split(SEPARADOR_ENTRADA).map((s) => s.trim()).filter(Boolean).map((parte) => {
    const m = parte.match(ITEM_ENTRADA);
    const qtd = m ? parseFloat(m[2].replace(",", ".")) : 0;
    return qtd > 0 ? { nome: m[1].trim(), qtd } : { invalido: parte };
  });
}

// Identifica o relatório pelo conteúdo, não pelos bytes do arquivo: o PDF gerado
// de novo traz outra data de impressão, mas as mesmas vendas.
function hashItens(itens) {
  const linhas = itens.map((it) => `${normaliza(it.nome)}|${it.qtd}`).sort();
  return crypto.createHash("sha256").update(linhas.join("\n")).digest("hex");
}

module.exports = { normaliza, slugify, parseEntrada, hashItens };
