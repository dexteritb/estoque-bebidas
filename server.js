require("dotenv").config({ quiet: true });
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const { pool, init } = require("./db");
const { normaliza, slugify, parseEntrada, hashItens } = require("./utils");
const { parseVendasPdf } = require("./parse-pdf");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.log("⚠ SESSION_SECRET não definido — usando um valor aleatório (sessões não sobrevivem a restart). Defina SESSION_SECRET no ambiente em produção.");
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1); // necessário atrás do proxy do Render pro cookie "secure" funcionar
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 12, // 12h
  },
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "not_authenticated" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "not_authenticated" });
  if (req.session.user.papel !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}
function resolveLoja(req) {
  const u = req.session.user;
  if (u.papel === "admin") {
    const l = req.query.loja || req.body.loja;
    return l === "saborei" || l === "holyburger" ? l : null;
  }
  return u.loja;
}
function nowIso() { return new Date().toISOString(); }
function asyncRoute(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });
}
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
// Trava o produto até o fim da transação, pra duas operações simultâneas não
// sobrescreverem o saldo uma da outra.
async function travarProduto(client, id, loja) {
  const { rows } = await client.query("SELECT * FROM produtos WHERE id = $1 AND loja = $2 FOR UPDATE", [id, loja]);
  return rows[0];
}
// Travar sempre na mesma ordem evita deadlock entre operações com vários produtos.
function porProdutoId(a, b) { return a.produtoId < b.produtoId ? -1 : a.produtoId > b.produtoId ? 1 : 0; }

// ---------- AUTH ----------
app.post("/api/login", asyncRoute(async (req, res) => {
  const { nome, pin } = req.body || {};
  if (!nome || !pin) return res.status(400).json({ error: "missing_fields" });
  const { rows } = await pool.query("SELECT * FROM usuarios");
  const user = rows.find((u) => normaliza(u.nome) === normaliza(nome));
  if (!user || !bcrypt.compareSync(String(pin), user.pin_hash)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  req.session.user = { id: user.id, nome: user.nome, papel: user.papel, loja: user.loja };
  res.json({ user: req.session.user });
}));

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM usuarios");
  res.json({ user: req.session.user || null, hasUsers: rows[0].c > 0 });
}));

// Lista pública (sem PIN) só pra montar a tela de login com os nomes.
app.get("/api/usuarios/publicos", asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT id, nome, papel, loja FROM usuarios ORDER BY nome");
  res.json({ usuarios: rows });
}));

// ---------- USUARIOS (admin only) ----------
app.get("/api/usuarios", requireAdmin, asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT id, nome, papel, loja, criado_em FROM usuarios ORDER BY nome");
  res.json({ usuarios: rows });
}));

app.post("/api/usuarios", requireAdmin, asyncRoute(async (req, res) => {
  const { nome, pin, papel, loja } = req.body || {};
  if (!nome || !/^\d{4}$/.test(String(pin || "")) || !["admin", "loja"].includes(papel)) {
    return res.status(400).json({ error: "invalid_fields" });
  }
  if (papel === "loja" && !["saborei", "holyburger"].includes(loja)) {
    return res.status(400).json({ error: "invalid_loja" });
  }
  const id = slugify(nome);
  const hash = bcrypt.hashSync(String(pin), 10);
  await pool.query(
    `INSERT INTO usuarios (id, nome, pin_hash, papel, loja, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET nome = $2, pin_hash = $3, papel = $4, loja = $5`,
    [id, nome, hash, papel, papel === "admin" ? null : loja, nowIso()]
  );
  res.json({ ok: true, id });
}));

app.delete("/api/usuarios/:id", requireAdmin, asyncRoute(async (req, res) => {
  if (req.params.id === req.session.user.id) return res.status(400).json({ error: "cannot_delete_self" });
  await pool.query("DELETE FROM usuarios WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
}));

// ---------- PRODUTOS ----------
app.get("/api/produtos", requireAuth, asyncRoute(async (req, res) => {
  const loja = resolveLoja(req);
  if (!loja) return res.status(400).json({ error: "loja_invalida" });
  const { rows } = await pool.query("SELECT * FROM produtos WHERE loja = $1 ORDER BY nome", [loja]);
  res.json({ produtos: rows });
}));

app.post("/api/produtos", requireAdmin, asyncRoute(async (req, res) => {
  const loja = resolveLoja(req);
  const { nome, preco, estoque, estoqueMinimo } = req.body || {};
  if (!loja || !nome || typeof preco !== "number" || preco < 0) {
    return res.status(400).json({ error: "invalid_fields" });
  }
  const id = loja + "__" + slugify(nome);
  const exists = await pool.query("SELECT id FROM produtos WHERE id = $1", [id]);
  if (exists.rows.length) return res.status(409).json({ error: "already_exists" });

  const est = Number(estoque) || 0;
  await pool.query(
    `INSERT INTO produtos (id, loja, nome, preco, estoque, estoque_minimo, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, loja, nome, preco, est, Number(estoqueMinimo) || 0, nowIso()]
  );
  if (est > 0) {
    await pool.query(
      `INSERT INTO movimentacoes (loja, produto, tipo, quantidade, estoque_antes, estoque_depois, origem, usuario, criado_em)
       VALUES ($1, $2, 'entrada', $3, 0, $3, 'cadastro do produto', $4, $5)`,
      [loja, nome, est, req.session.user.nome, nowIso()]
    );
  }
  res.json({ ok: true, id });
}));

app.patch("/api/produtos/:id/minimo", requireAdmin, asyncRoute(async (req, res) => {
  const { estoqueMinimo } = req.body || {};
  await pool.query("UPDATE produtos SET estoque_minimo = $1 WHERE id = $2", [Number(estoqueMinimo) || 0, req.params.id]);
  res.json({ ok: true });
}));

app.delete("/api/produtos/:id", requireAdmin, asyncRoute(async (req, res) => {
  const { confirmacao } = req.body || {};
  if (String(confirmacao || "").trim().toLowerCase() !== "excluir") {
    return res.status(400).json({ error: "confirmacao_invalida" });
  }
  const { rows } = await pool.query("SELECT * FROM produtos WHERE id = $1", [req.params.id]);
  const prod = rows[0];
  if (!prod) return res.status(404).json({ error: "not_found" });
  await pool.query("DELETE FROM produtos WHERE id = $1", [req.params.id]);
  await pool.query(
    `INSERT INTO movimentacoes (loja, produto, tipo, quantidade, estoque_antes, estoque_depois, motivo, usuario, criado_em)
     VALUES ($1, $2, 'ajuste', $3, $4, 0, 'Produto excluído do catálogo', $5, $6)`,
    [prod.loja, prod.nome, -(Number(prod.estoque) || 0), Number(prod.estoque) || 0, req.session.user.nome, nowIso()]
  );
  res.json({ ok: true });
}));

// ---------- ENTRADA ----------
app.post("/api/entrada", requireAuth, asyncRoute(async (req, res) => {
  const loja = resolveLoja(req);
  if (!loja) return res.status(400).json({ error: "loja_invalida" });
  const { texto } = req.body || {};
  if (!texto || !texto.trim()) return res.status(400).json({ error: "texto_vazio" });

  const { rows: produtos } = await pool.query("SELECT * FROM produtos WHERE loja = $1", [loja]);
  const validos = [];
  const naoEncontrados = [];

  for (const item of parseEntrada(texto)) {
    if (item.invalido) { naoEncontrados.push(item.invalido + " (formato não reconhecido)"); continue; }
    const prod = produtos.find((p) => normaliza(p.nome) === normaliza(item.nome));
    if (!prod) { naoEncontrados.push(item.nome + " (produto não encontrado)"); continue; }
    validos.push({ produtoId: prod.id, qtd: item.qtd });
  }

  const aplicados = await withTx(async (client) => {
    const feitos = [];
    for (const { produtoId, qtd } of validos.sort(porProdutoId)) {
      const prod = await travarProduto(client, produtoId, loja);
      if (!prod) continue;
      const antes = Number(prod.estoque) || 0;
      const depois = antes + qtd;
      await client.query("UPDATE produtos SET estoque = $1, atualizado_em = $2 WHERE id = $3", [depois, nowIso(), prod.id]);
      await client.query(
        `INSERT INTO movimentacoes (loja, produto, tipo, quantidade, estoque_antes, estoque_depois, origem, usuario, criado_em)
         VALUES ($1, $2, 'entrada', $3, $4, $5, 'manual', $6, $7)`,
        [loja, prod.nome, qtd, antes, depois, req.session.user.nome, nowIso()]
      );
      feitos.push({ produto: prod.nome, antes, depois });
    }
    return feitos;
  });
  res.json({ aplicados, naoEncontrados });
}));

// ---------- SAÍDA (PDF) ----------
app.post("/api/saida/preview", requireAuth, upload.single("pdf"), asyncRoute(async (req, res) => {
  const loja = resolveLoja(req);
  if (!loja) return res.status(400).json({ error: "loja_invalida" });
  if (!req.file) return res.status(400).json({ error: "arquivo_ausente" });
  try {
    const itens = await parseVendasPdf(req.file.buffer);
    const { rows: produtos } = await pool.query("SELECT * FROM produtos WHERE loja = $1", [loja]);
    const preview = itens.map((it) => {
      const prod = produtos.find((p) => normaliza(p.nome) === normaliza(it.nome));
      return {
        nomeExtraido: it.nome,
        qtd: it.qtd,
        produtoId: prod ? prod.id : null,
        produtoNome: prod ? prod.nome : null,
        estoqueAtual: prod ? Number(prod.estoque) : null,
        estoqueDepois: prod ? Number(prod.estoque) - it.qtd : null,
      };
    });
    if (!itens.length) return res.json({ itens: preview, filename: req.file.originalname });

    const { rows: salvas } = await pool.query(
      `INSERT INTO baixas (loja, hash, filename, itens, criado_em)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (loja, hash) DO UPDATE SET filename = EXCLUDED.filename, itens = EXCLUDED.itens
       WHERE baixas.aplicada_em IS NULL
       RETURNING id`,
      [loja, hashItens(itens), req.file.originalname, JSON.stringify(preview), nowIso()]
    );
    if (!salvas.length) {
      const { rows } = await pool.query(
        "SELECT filename, usuario, aplicada_em FROM baixas WHERE loja = $1 AND hash = $2",
        [loja, hashItens(itens)]
      );
      return res.json({ itens: preview, filename: req.file.originalname, jaAplicada: rows[0] });
    }
    res.json({ itens: preview, filename: req.file.originalname, baixaId: salvas[0].id });
  } catch (err) {
    res.status(500).json({ error: "erro_ao_ler_pdf", detalhe: String(err.message || err) });
  }
}));

app.post("/api/saida/confirmar", requireAuth, asyncRoute(async (req, res) => {
  const loja = resolveLoja(req);
  if (!loja) return res.status(400).json({ error: "loja_invalida" });
  const { baixaId } = req.body || {};
  if (!Number.isInteger(baixaId)) return res.status(400).json({ error: "baixa_invalida" });

  const aplicados = await withTx(async (client) => {
    // Marcar como aplicada primeiro: em dois cliques, o segundo fica esperando
    // esse UPDATE e depois não encontra mais a baixa pendente.
    const { rows } = await client.query(
      `UPDATE baixas SET aplicada_em = $1, usuario = $2
       WHERE id = $3 AND loja = $4 AND aplicada_em IS NULL
       RETURNING itens, filename`,
      [nowIso(), req.session.user.nome, baixaId, loja]
    );
    if (!rows.length) return null;
    const { itens, filename } = rows[0];

    let count = 0;
    for (const it of itens.filter((i) => i.produtoId).sort(porProdutoId)) {
      const prod = await travarProduto(client, it.produtoId, loja);
      if (!prod) continue;
      const antes = Number(prod.estoque) || 0;
      const depois = antes - it.qtd;
      await client.query("UPDATE produtos SET estoque = $1, atualizado_em = $2 WHERE id = $3", [depois, nowIso(), prod.id]);
      await client.query(
        `INSERT INTO movimentacoes (loja, produto, tipo, quantidade, estoque_antes, estoque_depois, origem, usuario, criado_em)
         VALUES ($1, $2, 'saida', $3, $4, $5, $6, $7, $8)`,
        [loja, prod.nome, it.qtd, antes, depois, filename || "relatório de vendas", req.session.user.nome, nowIso()]
      );
      count++;
    }
    return count;
  });
  if (aplicados === null) return res.status(409).json({ error: "baixa_ja_aplicada" });
  res.json({ ok: true, aplicados });
}));

// ---------- AJUSTE (admin only) ----------
app.post("/api/ajuste", requireAdmin, asyncRoute(async (req, res) => {
  const loja = resolveLoja(req);
  const { produtoId, novoSaldo, motivo } = req.body || {};
  if (!loja || !produtoId || typeof novoSaldo !== "number" || !motivo || !motivo.trim()) {
    return res.status(400).json({ error: "invalid_fields" });
  }
  const encontrado = await withTx(async (client) => {
    const prod = await travarProduto(client, produtoId, loja);
    if (!prod) return false;
    const antes = Number(prod.estoque) || 0;
    const delta = novoSaldo - antes;
    await client.query("UPDATE produtos SET estoque = $1, atualizado_em = $2 WHERE id = $3", [novoSaldo, nowIso(), prod.id]);
    await client.query(
      `INSERT INTO movimentacoes (loja, produto, tipo, quantidade, estoque_antes, estoque_depois, motivo, usuario, criado_em)
       VALUES ($1, $2, 'ajuste', $3, $4, $5, $6, $7, $8)`,
      [loja, prod.nome, delta, antes, novoSaldo, motivo.trim(), req.session.user.nome, nowIso()]
    );
    return true;
  });
  if (!encontrado) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}));

// ---------- MOVIMENTACOES ----------
app.get("/api/movimentacoes", requireAuth, asyncRoute(async (req, res) => {
  const loja = resolveLoja(req);
  if (!loja) return res.status(400).json({ error: "loja_invalida" });
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const { rows } = await pool.query(
    "SELECT * FROM movimentacoes WHERE loja = $1 ORDER BY criado_em DESC LIMIT $2",
    [loja, limit]
  );
  res.json({ movimentacoes: rows });
}));

init()
  .then(() => {
    app.listen(PORT, () => console.log(`Controle de estoque rodando na porta ${PORT}`));
  })
  .catch((err) => {
    console.error("Falha ao inicializar o banco de dados:", err);
    process.exit(1);
  });
