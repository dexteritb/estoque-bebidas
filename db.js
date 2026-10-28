const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { slugify } = require("./utils");
const { saborei, holyburger } = require("./seed-data");

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL não definido. Configure a variável de ambiente com a connection string do Postgres.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // A maioria dos provedores gerenciados (Render, Neon, Supabase) exige SSL.
  // Se o seu não usar, defina PGSSL=disable no ambiente.
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      papel TEXT NOT NULL CHECK (papel IN ('admin','loja')),
      loja TEXT,
      criado_em TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id TEXT PRIMARY KEY,
      loja TEXT NOT NULL,
      nome TEXT NOT NULL,
      preco NUMERIC NOT NULL DEFAULT 0,
      estoque NUMERIC NOT NULL DEFAULT 0,
      estoque_minimo NUMERIC NOT NULL DEFAULT 0,
      atualizado_em TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movimentacoes (
      id SERIAL PRIMARY KEY,
      loja TEXT NOT NULL,
      produto TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste')),
      quantidade NUMERIC NOT NULL,
      estoque_antes NUMERIC,
      estoque_depois NUMERIC,
      origem TEXT,
      motivo TEXT,
      usuario TEXT,
      criado_em TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_produtos_loja ON produtos(loja);
    CREATE INDEX IF NOT EXISTS idx_mov_loja ON movimentacoes(loja, criado_em DESC);
  `);
}

async function seedCatalog(loja, catalog) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM produtos WHERE loja = $1", [loja]);
  if (rows[0].c > 0) return;
  const now = new Date().toISOString();
  for (const [nome, preco] of catalog) {
    await pool.query(
      `INSERT INTO produtos (id, loja, nome, preco, estoque, estoque_minimo, atualizado_em)
       VALUES ($1, $2, $3, $4, 0, 5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [loja + "__" + slugify(nome), loja, nome, preco, now]
    );
  }
}

async function seedDefaultAdmin() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM usuarios");
  if (rows[0].c > 0) return;
  const hash = bcrypt.hashSync("0000", 10);
  await pool.query(
    `INSERT INTO usuarios (id, nome, pin_hash, papel, loja, criado_em)
     VALUES ('admin', 'Admin', $1, 'admin', NULL, $2)`,
    [hash, new Date().toISOString()]
  );
  console.log("⚠ Usuário admin criado com PIN padrão 0000 — troque assim que entrar!");
}

async function init() {
  await migrate();
  await seedCatalog("saborei", saborei);
  await seedCatalog("holyburger", holyburger);
  await seedDefaultAdmin();
}

module.exports = { pool, init };
