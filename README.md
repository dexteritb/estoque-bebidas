# Controle de Estoque — Bebidas (Saborei / Holy Burger)

Sistema próprio (Node.js + Express + PostgreSQL), sem depender de conta Claude
— pensado pra rodar no Render, do mesmo jeito que o `pix-webhook-bb`. Login
por nome + PIN de verdade (hash no servidor, sessão em cookie).

## Deploy no Render

### 1. Colocar o código num repositório

O Render puxa de um repositório Git (GitHub, GitLab ou Bitbucket). Se ainda
não tem um repo pra isso, cria um novo no GitHub e sobe essa pasta inteira
(menos `node_modules` e `data`, que já estão no `.gitignore`).

### 2. Criar o Blueprint

1. No dashboard do Render: **New → Blueprint**
2. Conecta o repositório que você acabou de criar
3. O Render lê o `render.yaml` que já está nessa pasta e mostra os dois
   recursos que vai criar: o **banco Postgres** (`estoque-bebidas-db`) e o
   **serviço web** (`estoque-bebidas`)
4. Clica em **Deploy Blueprint**

Isso já sobe tudo: instala as dependências, cria as tabelas automaticamente
no primeiro start, cadastra os produtos das duas lojas e cria o usuário
`Admin` com PIN `0000`.

### ⚠ Sobre o banco gratuito do Render

O `render.yaml` está configurado com `plan: free` no banco — **isso expira
30 dias depois de criado e os dados somem**. Pra um sistema de estoque de
verdade, antes de começar a usar valendo, troque para um banco persistente:

- **Mais simples**: no dashboard do Render, edita o banco `estoque-bebidas-db`
  e muda o plano pra `Basic-256mb` (~US$6-7/mês)
- **Sem custo, mas fora do Render**: cria um banco grátis (permanente) na
  [Neon](https://neon.tech) ou [Supabase](https://supabase.com), copia a
  connection string de lá, e cola manualmente na variável `DATABASE_URL` do
  serviço web no Render (Settings → Environment). Aí você pode até apagar o
  banco do Render.

### 3. Primeiro acesso

Abre a URL que o Render deu pro serviço web (algo como
`https://estoque-bebidas.onrender.com`). Entra com `Admin` / PIN `0000` e:

1. Vai em 👤 Usuários → cria os usuários de verdade (inclusive um novo admin
   com PIN diferente)
2. Remove ou troca o PIN do usuário `Admin` padrão

### Sobre o plano gratuito do serviço web

Web services grátis do Render "dormem" depois de 15 minutos sem uso — a
próxima pessoa que abrir demora uns 30-60 segundos pra carregar (é só a
primeira vez depois de um tempo parado). Se isso incomodar no dia a dia da
loja, o plano `Starter` (~US$7/mês) deixa sempre ativo, sem esse delay. Pra
mudar, edita o `plan: free` do serviço `estoque-bebidas` no `render.yaml`
pra `starter` (ou muda direto no dashboard).

## Rodando localmente (pra testar antes de subir)

Precisa de um Postgres acessível (local ou remoto).

```bash
npm install
cp .env.example .env
# edita o .env com a DATABASE_URL do seu Postgres local ou de teste
npm start
```

## Estrutura

```
server.js          → API (Express) — login, produtos, entrada/saída, ajuste
db.js               → Conexão Postgres, criação de tabelas, seed inicial
parse-pdf.js        → Extrai produto/quantidade do PDF de vendas do STI3
seed-data.js        → Catálogo inicial (preços do Saborei e do Holy Burger)
public/              → Frontend (HTML/CSS/JS puro, sem build step)
render.yaml          → Blueprint pro deploy automático no Render
```

## Papéis de usuário

- **Admin**: vê as duas lojas, gerencia usuários, cadastra/exclui produtos,
  faz ajuste de estoque
- **Usuário de loja**: só vê e opera a loja dele (Saborei ou Holy Burger);
  não acessa usuários, cadastro/exclusão de produto nem ajuste

## Backup

Se usar o Postgres do Render (plano pago), ele já faz backup automático com
recuperação por ponto no tempo. Se usar Neon/Supabase, cada um tem sua
própria política — vale conferir. De qualquer forma, um `pg_dump` periódico
pro seu computador nunca é demais:

```bash
pg_dump "sua-connection-string-aqui" > backup-estoque.sql
```

## O que muda em relação à versão em artefato Claude

- Login com senha de verdade (PIN com hash no servidor, cookie de sessão
  HTTP-only) — não depende mais de conta Claude nem de organização
- Qualquer pessoa com o link acessa, de qualquer lugar, sem precisar de login
  no Claude
- Dados num Postgres de verdade, com backup e sem limite de 20 MB
