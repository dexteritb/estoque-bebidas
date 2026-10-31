const STORE_LABEL = { saborei: "Saborei", holyburger: "Holy Burger" };

function fmtMoney(v){ return "R$ " + (v||0).toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2}); }
function fmtQtd(v){ return (v||0).toLocaleString("pt-BR",{minimumFractionDigits:0, maximumFractionDigits:2}); }
function fmtDate(iso){
  try{ const d=new Date(iso); return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
  catch(e){ return iso||""; }
}
function escapeHtml(s){ const d = document.createElement("div"); d.textContent = s==null?"":s; return d.innerHTML; }

async function api(path, opts){
  const res = await fetch(path, Object.assign({ headers: {"Content-Type":"application/json"} }, opts));
  let body = null;
  try{ body = await res.json(); }catch(e){}
  if(!res.ok){ const err = new Error((body && body.error) || res.statusText); err.status = res.status; err.body = body; throw err; }
  return body;
}

let session = null; // {id, nome, papel, loja}
let currentStore = "saborei";
let produtosCache = [];

async function init(){
  document.getElementById("storeToggle").addEventListener("click", (e)=>{
    const btn = e.target.closest("button[data-store]");
    if(btn) switchStore(btn.dataset.store);
  });
  document.getElementById("filepick").addEventListener("click", ()=>document.getElementById("pdfInput").click());
  document.getElementById("pdfInput").addEventListener("change", handlePdf);
  document.getElementById("btnEntrada").addEventListener("click", handleEntrada);
  document.getElementById("btnAjuste").addEventListener("click", handleAjuste);
  document.getElementById("btnLogout").addEventListener("click", logout);
  document.getElementById("btnShowAddUser").addEventListener("click", ()=>{ document.getElementById("addUserForm").style.display = "block"; });
  document.getElementById("btnCancelUser").addEventListener("click", ()=>{ document.getElementById("addUserForm").style.display = "none"; });
  document.getElementById("newUserPapel").addEventListener("change", (e)=>{
    document.getElementById("newUserLojaWrap").style.display = e.target.value==="admin" ? "none":"block";
  });
  document.getElementById("btnSaveUser").addEventListener("click", handleSaveUser);
  document.getElementById("btnCancelDelete").addEventListener("click", closeDeleteModal);
  document.getElementById("deleteConfirmInput").addEventListener("input", (e)=>{
    document.getElementById("btnConfirmDelete").disabled = e.target.value.trim().toLowerCase() !== "excluir";
  });
  document.getElementById("btnConfirmDelete").addEventListener("click", confirmDeleteProduto);
  document.getElementById("btnShowAddProduto").addEventListener("click", ()=>{ document.getElementById("addProdutoForm").style.display = "block"; });
  document.getElementById("btnCancelProduto").addEventListener("click", ()=>{ document.getElementById("addProdutoForm").style.display = "none"; });
  document.getElementById("btnSaveProduto").addEventListener("click", handleSaveProduto);

  const me = await api("/api/me");
  if(me.user){
    session = me.user;
    enterApp();
  } else {
    renderLogin();
  }
}

// ---------- LOGIN ----------
async function renderLogin(){
  const card = document.getElementById("loginCard");
  let usuarios = [];
  try{ const r = await api("/api/usuarios/publicos"); usuarios = r.usuarios; }catch(e){}

  card.innerHTML = `
    <h1>🥤 Controle de Estoque</h1>
    <div class="login-sub">Selecione seu nome para entrar</div>
    <div class="user-list" id="userSelectList"></div>
  `;
  const list = document.getElementById("userSelectList");
  usuarios.forEach(u=>{
    const btn = document.createElement("button");
    btn.className = "user-btn";
    btn.innerHTML = `<span>${escapeHtml(u.nome)}</span><small>${u.papel==="admin"?"Admin":STORE_LABEL[u.loja]||""}</small>`;
    btn.addEventListener("click", ()=>showPinPrompt(u));
    list.appendChild(btn);
  });
}

function showPinPrompt(user){
  const card = document.getElementById("loginCard");
  card.innerHTML = `
    <h1>🥤 Controle de Estoque</h1>
    <div class="login-sub">Digite o PIN de <b>${escapeHtml(user.nome)}</b></div>
    <div class="pin-row"><input type="password" id="pinInput" maxlength="4" inputmode="numeric" placeholder="••••"></div>
    <div class="row"><button class="primary" id="btnPinConfirm" style="flex:1; justify-content:center;">Entrar</button>
      <button class="secondary" id="btnPinBack">Voltar</button></div>
    <div id="pinStatus"></div>
  `;
  const pinInput = document.getElementById("pinInput");
  pinInput.focus();
  const tryLogin = async ()=>{
    const pin = pinInput.value.trim();
    try{
      const r = await api("/api/login", { method:"POST", body: JSON.stringify({ nome: user.nome, pin }) });
      session = r.user;
      enterApp();
    }catch(err){
      document.getElementById("pinStatus").innerHTML = '<div class="status-msg err">PIN incorreto.</div>';
      pinInput.value = ""; pinInput.focus();
    }
  };
  document.getElementById("btnPinConfirm").addEventListener("click", tryLogin);
  pinInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter") tryLogin(); });
  document.getElementById("btnPinBack").addEventListener("click", renderLogin);
}

async function logout(){
  try{ await api("/api/logout", { method:"POST" }); }catch(e){}
  session = null;
  document.getElementById("appScreen").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
  renderLogin();
}

function enterApp(){
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  document.getElementById("whoName").textContent = session.nome;
  document.getElementById("whoRole").textContent = session.papel==="admin" ? "Admin" : STORE_LABEL[session.loja];

  const isAdmin = session.papel === "admin";
  document.getElementById("storeToggle").style.display = isAdmin ? "flex" : "none";
  document.getElementById("adminUsersSection").style.display = isAdmin ? "block" : "none";
  document.getElementById("ajusteSection").style.display = isAdmin ? "block" : "none";
  document.getElementById("addProdutoWrap").style.display = isAdmin ? "block" : "none";

  if(isAdmin) loadUserList();

  const storeToOpen = isAdmin ? currentStore : session.loja;
  switchStore(storeToOpen);
}

// ---------- USUARIOS (admin) ----------
async function loadUserList(){
  try{
    const r = await api("/api/usuarios");
    renderUserList(r.usuarios);
  }catch(e){}
}

function renderUserList(usuarios){
  const box = document.getElementById("userList");
  if(usuarios.length===0){ box.innerHTML = '<div class="empty">Nenhum usuário.</div>'; return; }
  box.innerHTML = usuarios.map(u=>`
    <div class="user-row">
      <div>
        <div>${escapeHtml(u.nome)}</div>
        <div class="meta">${u.papel==="admin" ? "Admin" : "Loja: " + (STORE_LABEL[u.loja]||"—")}</div>
      </div>
      <button class="danger" data-del="${u.id}" ${u.id===session.id?"disabled":""}>Remover</button>
    </div>
  `).join("");
  box.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!confirm("Remover este usuário?")) return;
      try{ await api("/api/usuarios/"+btn.dataset.del, { method:"DELETE" }); loadUserList(); }catch(e){}
    });
  });
}

async function handleSaveUser(){
  const nome = document.getElementById("newUserNome").value.trim();
  const pin = document.getElementById("newUserPin").value.trim();
  const papel = document.getElementById("newUserPapel").value;
  const loja = document.getElementById("newUserLoja").value;
  const statusEl = document.getElementById("userStatus");
  if(!nome || !/^\d{4}$/.test(pin)){
    statusEl.innerHTML = '<div class="status-msg err">Preencha o nome e um PIN de 4 dígitos.</div>'; return;
  }
  try{
    await api("/api/usuarios", { method:"POST", body: JSON.stringify({ nome, pin, papel, loja }) });
    statusEl.innerHTML = '<div class="status-msg ok">✔ Usuário salvo.</div>';
    document.getElementById("newUserNome").value = "";
    document.getElementById("newUserPin").value = "";
    document.getElementById("addUserForm").style.display = "none";
    loadUserList();
  }catch(err){
    statusEl.innerHTML = '<div class="status-msg err">Erro: ' + (err.body && err.body.error || err.message) + '</div>';
  }
}

// ---------- STORE / ESTOQUE ----------
async function switchStore(loja){
  currentStore = loja;
  document.querySelectorAll("#storeToggle button").forEach(b=>{
    b.classList.toggle("active", b.dataset.store===loja);
  });
  document.getElementById("pdfPreview").innerHTML = "";
  document.getElementById("entradaStatus").innerHTML = "";
  document.getElementById("ajusteStatus").innerHTML = "";
  await loadProdutos();
  await loadMovimentacoes();
}

function lojaParam(){ return session.papel === "admin" ? ("?loja=" + currentStore) : ""; }

async function loadProdutos(){
  try{
    const r = await api("/api/produtos" + lojaParam());
    produtosCache = r.produtos.map(p=>({ id:p.id, nome:p.nome, preco:p.preco, estoque:p.estoque, estoqueMinimo:p.estoque_minimo }));
    produtosCache.sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
    renderEstoque();
    renderAjusteOptions();
  }catch(e){
    document.getElementById("estoqueBody").innerHTML = '<tr><td colspan="6" class="empty">Erro ao carregar estoque.</td></tr>';
  }
}

async function loadMovimentacoes(){
  try{
    const r = await api("/api/movimentacoes" + lojaParam() + (session.papel==="admin"?"&limit=50":"?limit=50"));
    renderMovs(r.movimentacoes.map(m=>({
      produto:m.produto, tipo:m.tipo, quantidade:m.quantidade, usuario:m.usuario,
      origem:m.origem, motivo:m.motivo, criadoEm:m.criado_em
    })));
  }catch(e){
    document.getElementById("movBody").innerHTML = '<div class="empty">Erro ao carregar histórico.</div>';
  }
}

function renderEstoque(){
  const body = document.getElementById("estoqueBody");
  const isAdmin = session.papel === "admin";
  document.getElementById("acoesHeader").style.display = isAdmin ? "table-cell" : "none";
  const colCount = isAdmin ? 6 : 5;
  if(produtosCache.length===0){
    body.innerHTML = `<tr><td colspan="${colCount}" class="empty">Nenhum produto cadastrado.</td></tr>`;
  } else {
    body.innerHTML = produtosCache.map(p=>{
      let badge = '<span class="badge ok">OK</span>';
      if(p.estoque < 0) badge = '<span class="badge neg">Negativo</span>';
      else if(p.estoque <= (p.estoqueMinimo||0)) badge = '<span class="badge low">Baixo</span>';
      const acoesCell = isAdmin ? `<td><button class="btn-icon" data-del-produto="${p.id}" title="Excluir produto">🗑</button></td>` : "";
      return `<tr>
        <td>${escapeHtml(p.nome)}</td>
        <td class="num">${fmtMoney(p.preco)}</td>
        <td class="num">${fmtQtd(p.estoque)}</td>
        <td class="num"><input type="number" value="${p.estoqueMinimo||0}" min="0" data-id="${p.id}" class="minInput" ${!isAdmin?"disabled":""}></td>
        <td>${badge}</td>
        ${acoesCell}
      </tr>`;
    }).join("");
    body.querySelectorAll(".minInput").forEach(inp=>{
      inp.addEventListener("change", async (e)=>{
        const id = e.target.dataset.id;
        const val = parseFloat(e.target.value)||0;
        try{ await api("/api/produtos/"+id+"/minimo", { method:"PATCH", body: JSON.stringify({ estoqueMinimo: val }) }); }catch(err){}
      });
    });
    body.querySelectorAll("[data-del-produto]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const prod = produtosCache.find(p=>p.id===btn.dataset.delProduto);
        if(prod) openDeleteModal(prod);
      });
    });
  }
  const total = produtosCache.reduce((s,p)=>s+(p.estoque||0),0);
  const baixo = produtosCache.filter(p=>p.estoque>=0 && p.estoque<=(p.estoqueMinimo||0)).length;
  const negativo = produtosCache.filter(p=>p.estoque<0).length;
  document.getElementById("cardTotalItens").textContent = fmtQtd(total);
  document.getElementById("cardBaixo").textContent = baixo;
  document.getElementById("cardNegativo").textContent = negativo;
}

function renderAjusteOptions(){
  const sel = document.getElementById("ajusteProduto");
  if(!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = produtosCache.map(p=>`<option value="${p.id}">${escapeHtml(p.nome)} (atual: ${fmtQtd(p.estoque)})</option>`).join("");
  if(prevVal && produtosCache.find(p=>p.id===prevVal)) sel.value = prevVal;
}

function renderMovs(movs){
  const box = document.getElementById("movBody");
  document.getElementById("cardMov").textContent = movs.length;
  if(movs.length===0){ box.innerHTML = '<div class="empty">Nenhuma movimentação registrada ainda.</div>'; return; }
  box.innerHTML = movs.map(m=>{
    const label = m.tipo==="entrada" ? "Entrada" : m.tipo==="saida" ? "Saída" : "Ajuste";
    const sinal = m.quantidade>=0 ? "+" : "";
    const origem = [m.usuario, m.origem].filter(Boolean).join(" · ");
    return `<div class="mov-item">
      <div class="mov-left">
        <span>${escapeHtml(m.produto)}${m.motivo ? " — " + escapeHtml(m.motivo) : ""}</span>
        <span class="mov-date">${fmtDate(m.criadoEm)}${origem ? " · " + escapeHtml(origem) : ""}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="tag ${m.tipo}">${label}</span>
        <span class="num" style="min-width:52px;">${sinal}${fmtQtd(m.quantidade)}</span>
      </div>
    </div>`;
  }).join("");
}

// ---------- ENTRADA ----------
async function handleEntrada(){
  const texto = document.getElementById("entradaInput").value.trim();
  const statusEl = document.getElementById("entradaStatus");
  statusEl.innerHTML = "";
  if(!texto) return;
  try{
    const r = await api("/api/entrada" + lojaParam(), { method:"POST", body: JSON.stringify({ texto }) });
    let html = "";
    if(r.aplicados.length){
      html += '<div class="status-msg ok">✔ Entrada aplicada: ' + r.aplicados.map(a=>a.produto+": "+a.antes+" → "+a.depois).join(" · ") + '</div>';
      document.getElementById("entradaInput").value = "";
    }
    if(r.naoEncontrados.length){
      html += '<div class="status-msg err">⚠ Não aplicado: ' + r.naoEncontrados.join(" · ") + '</div>';
    }
    statusEl.innerHTML = html;
    loadProdutos(); loadMovimentacoes();
  }catch(err){
    statusEl.innerHTML = '<div class="status-msg err">Erro ao aplicar entrada.</div>';
  }
}

// ---------- SAÍDA (PDF) ----------
let pendingSaida = null;

async function handlePdf(e){
  const file = e.target.files[0];
  if(!file) return;
  const previewEl = document.getElementById("pdfPreview");
  previewEl.innerHTML = '<div class="hint">Lendo PDF…</div>';
  try{
    const formData = new FormData();
    formData.append("pdf", file);
    const res = await fetch("/api/saida/preview" + lojaParam(), { method:"POST", body: formData });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || "erro"); }
    if(!data.itens || data.itens.length===0){
      previewEl.innerHTML = '<div class="status-msg err">Nenhum item reconhecido nesse PDF. Verifique se é um relatório de "Totalização de Produtos por Venda Agrupado".</div>';
      pendingSaida = null;
      return;
    }
    if(data.jaAplicada){
      const j = data.jaAplicada;
      pendingSaida = null;
      previewEl.innerHTML = `<div class="status-msg err">⚠ Este relatório já teve baixa em ${escapeHtml(fmtDate(j.aplicada_em))}${j.usuario ? " por " + escapeHtml(j.usuario) : ""}${j.filename ? " (" + escapeHtml(j.filename) + ")" : ""}. Nada foi alterado.</div>`;
    } else {
      renderSaidaPreview(data.itens, data.baixaId);
    }
  }catch(err){
    previewEl.innerHTML = '<div class="status-msg err">Erro ao ler o PDF.</div>';
  }
  e.target.value = "";
}

function renderSaidaPreview(itens, baixaId){
  const previewEl = document.getElementById("pdfPreview");
  const casados = itens.filter(it=>it.produtoId);
  const fora = itens.filter(it=>!it.produtoId);
  const rows = casados.map(it=>{
    const cls = it.estoqueDepois < 0 ? "unmatched" : "";
    return `<div class="preview-item ${cls}"><span>${escapeHtml(it.produtoNome)}</span><span>${fmtQtd(it.estoqueAtual)} → ${fmtQtd(it.estoqueDepois)} (−${fmtQtd(it.qtd)})${it.estoqueDepois<0?" ⚠":""}</span></div>`;
  }).join("");
  // Itens que não estão no catálogo de bebidas (lanches, porções, adicionais…)
  // são ignorados na baixa. Ficam numa lista recolhida pra você conferir se
  // alguma bebida deixou de casar por causa do nome.
  const foraHtml = fora.length ? `
    <details style="margin-top:10px;">
      <summary class="hint" style="cursor:pointer;">${fora.length} ${fora.length===1?"item fora":"itens fora"} do catálogo de bebidas (serão ignorados) — clique para ver</summary>
      ${fora.map(it=>`<div class="preview-item" style="color:var(--text-muted);"><span>${escapeHtml(it.nomeExtraido)}</span><span>${fmtQtd(it.qtd)}</span></div>`).join("")}
    </details>` : "";
  previewEl.innerHTML = `
    <div class="hint" style="margin:10px 0 4px;">Pré-visualização — ${casados.length} ${casados.length===1?"bebida encontrada":"bebidas encontradas"} no catálogo:</div>
    ${rows || '<div class="empty">Nenhuma bebida do catálogo neste relatório.</div>'}
    ${foraHtml}
    <div class="row">
      <button class="primary" id="btnConfirmarSaida" ${casados.length===0?"disabled":""}>Confirmar baixa (${casados.length} ${casados.length===1?"item":"itens"})</button>
      <button class="secondary" id="btnCancelarSaida">Cancelar</button>
    </div>
  `;
  pendingSaida = { baixaId };
  document.getElementById("btnConfirmarSaida").addEventListener("click", confirmSaida);
  document.getElementById("btnCancelarSaida").addEventListener("click", ()=>{ previewEl.innerHTML = ""; pendingSaida = null; });
}

async function confirmSaida(){
  if(!pendingSaida) return;
  const btn = document.getElementById("btnConfirmarSaida");
  btn.disabled = true; btn.textContent = "Aplicando…";
  try{
    await api("/api/saida/confirmar" + lojaParam(), { method:"POST", body: JSON.stringify(pendingSaida) });
    document.getElementById("pdfPreview").innerHTML = '<div class="status-msg ok">✔ Baixa aplicada com sucesso.</div>';
    pendingSaida = null;
    loadProdutos(); loadMovimentacoes();
  }catch(err){
    const jaFeita = err.body && err.body.error === "baixa_ja_aplicada";
    document.getElementById("pdfPreview").innerHTML = `<div class="status-msg err">${jaFeita ? "⚠ Este relatório já teve baixa. Nada foi alterado." : "Erro ao aplicar baixa."}</div>`;
    pendingSaida = null;
    loadProdutos(); loadMovimentacoes();
  }
}

// ---------- AJUSTE (admin only) ----------
async function handleAjuste(){
  const statusEl = document.getElementById("ajusteStatus");
  statusEl.innerHTML = "";
  const produtoId = document.getElementById("ajusteProduto").value;
  const novoSaldoRaw = document.getElementById("ajusteNovoSaldo").value;
  const motivo = document.getElementById("ajusteMotivo").value.trim();
  if(!produtoId){ statusEl.innerHTML = '<div class="status-msg err">Selecione um produto.</div>'; return; }
  if(novoSaldoRaw===""){ statusEl.innerHTML = '<div class="status-msg err">Informe o novo saldo.</div>'; return; }
  if(!motivo){ statusEl.innerHTML = '<div class="status-msg err">Informe o motivo do ajuste.</div>'; return; }
  try{
    await api("/api/ajuste" + lojaParam(), { method:"POST", body: JSON.stringify({ produtoId, novoSaldo: parseFloat(novoSaldoRaw), motivo }) });
    statusEl.innerHTML = '<div class="status-msg ok">✔ Ajuste aplicado.</div>';
    document.getElementById("ajusteNovoSaldo").value = "";
    document.getElementById("ajusteMotivo").value = "";
    loadProdutos(); loadMovimentacoes();
  }catch(err){
    statusEl.innerHTML = '<div class="status-msg err">Erro ao aplicar ajuste.</div>';
  }
}

// ---------- EXCLUIR PRODUTO (admin only) ----------
let pendingDeleteProduto = null;

function openDeleteModal(prod){
  pendingDeleteProduto = prod;
  document.getElementById("deleteProdNome").textContent = prod.nome;
  document.getElementById("deleteConfirmInput").value = "";
  document.getElementById("deleteModalStatus").innerHTML = "";
  document.getElementById("btnConfirmDelete").disabled = true;
  document.getElementById("deleteModal").style.display = "flex";
  document.getElementById("deleteConfirmInput").focus();
}
function closeDeleteModal(){
  pendingDeleteProduto = null;
  document.getElementById("deleteModal").style.display = "none";
}
async function confirmDeleteProduto(){
  if(!pendingDeleteProduto) return;
  const confirmacao = document.getElementById("deleteConfirmInput").value.trim();
  if(confirmacao.toLowerCase() !== "excluir") return;
  const btn = document.getElementById("btnConfirmDelete");
  btn.disabled = true; btn.textContent = "Excluindo…";
  try{
    await api("/api/produtos/"+pendingDeleteProduto.id, { method:"DELETE", body: JSON.stringify({ confirmacao }) });
    closeDeleteModal();
    loadProdutos(); loadMovimentacoes();
  }catch(err){
    document.getElementById("deleteModalStatus").innerHTML = '<div class="status-msg err">Erro ao excluir.</div>';
    btn.disabled = false; btn.textContent = "Excluir definitivamente";
  }
}

// ---------- ADICIONAR PRODUTO (admin only) ----------
async function handleSaveProduto(){
  const statusEl = document.getElementById("addProdutoStatus");
  statusEl.innerHTML = "";
  const nome = document.getElementById("newProdNome").value.trim();
  const preco = parseFloat(document.getElementById("newProdPreco").value);
  const estoque = parseFloat(document.getElementById("newProdEstoque").value) || 0;
  const estoqueMinimo = parseFloat(document.getElementById("newProdMinimo").value) || 0;
  if(!nome){ statusEl.innerHTML = '<div class="status-msg err">Informe o nome do produto.</div>'; return; }
  if(isNaN(preco) || preco < 0){ statusEl.innerHTML = '<div class="status-msg err">Informe um preço válido.</div>'; return; }
  try{
    await api("/api/produtos" + lojaParam(), { method:"POST", body: JSON.stringify({ nome, preco, estoque, estoqueMinimo }) });
    statusEl.innerHTML = '<div class="status-msg ok">✔ Produto cadastrado.</div>';
    document.getElementById("newProdNome").value = "";
    document.getElementById("newProdPreco").value = "";
    document.getElementById("newProdEstoque").value = "0";
    document.getElementById("newProdMinimo").value = "5";
    document.getElementById("addProdutoForm").style.display = "none";
    loadProdutos(); loadMovimentacoes();
  }catch(err){
    const msg = err.body && err.body.error === "already_exists" ? "Já existe um produto com esse nome nesta loja." : "Erro ao cadastrar.";
    statusEl.innerHTML = '<div class="status-msg err">' + msg + '</div>';
  }
}

init();
