'use strict';

const BANDEIRA_PADRAO = '/images/flags/Flag_of_North_Macedonia.svg.webp';
const COR_PADRAO = '#d1b725';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Se algo der errado antes do painel abrir, mostra o motivo na tela (em vez de ficar só "Carregando…")
function mostrarFalha(msg) {
    const c = document.querySelector('#carregando');
    if (c && !c.hidden) c.textContent = 'Erro ao carregar a administração: ' + msg + ' (abra o console com F12 para mais detalhes)';
}
window.addEventListener('error', ev => mostrarFalha(ev.message));
window.addEventListener('unhandledrejection', ev => mostrarFalha((ev.reason && ev.reason.message) || String(ev.reason)));

let csrf = null;
let posts = [];
let editandoId = null;
let config = null;

/* ───────────── utilidades ───────────── */
async function api(metodo, url, corpo) {
    const opcoes = { method: metodo, headers: {}, credentials: 'same-origin' };
    if (corpo !== undefined) {
        opcoes.headers['Content-Type'] = 'application/json';
        opcoes.body = JSON.stringify(corpo);
    }
    if (csrf && metodo !== 'GET') opcoes.headers['X-CSRF-Token'] = csrf;
    let resp;
    const ctl = new AbortController();
    const limite = setTimeout(() => ctl.abort(), 25000);
    opcoes.signal = ctl.signal;
    try { resp = await fetch(url, opcoes); }
    catch (e) { throw new Error(e && e.name === 'AbortError' ? 'O servidor demorou demais para responder.' : 'Sem conexão com o servidor.'); }
    finally { clearTimeout(limite); }
    let dados = {};
    try { dados = await resp.json(); } catch { /* sem corpo */ }
    if (resp.status === 401 && url !== '/api/admin/login') {
        mostrar('tela-login');
        throw new Error(dados.erro || 'Sessão expirada. Entre novamente.');
    }
    if (!resp.ok) throw new Error(dados.erro || 'Algo deu errado.');
    return dados;
}

function mostrar(id) {
    for (const t of ['carregando', 'tela-setup', 'tela-login', 'tela-painel']) $('#' + t).hidden = t !== id;
}
function avisar(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => { t.hidden = true; }, 3200);
}
function setErro(form, msg) { const e = $('[data-erro]', form); if (e) e.textContent = msg || ''; }
function setOk(form, msg) { const e = $('[data-ok]', form); if (e) e.textContent = msg || ''; }
function el(tag, props = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
    }
    for (const f of filhos) if (f) e.append(f);
    return e;
}
async function comEnvio(botao, fn) {
    botao.disabled = true;
    try { await fn(); } finally { botao.disabled = false; }
}
function aoEnviar(form, fn) {
    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        setErro(form, ''); setOk(form, '');
        const btn = $('button[type="submit"]', form);
        try { await comEnvio(btn, () => fn(form)); } catch (e) { setErro(form, e.message); }
    });
}

/* ───────────── início / autenticação ───────────── */
async function iniciar() {
    try {
        const st = await api('GET', '/api/admin/status');
        csrf = st.csrf;
        if (!st.configurado) return mostrar('tela-setup');
        if (!st.logado) return mostrar('tela-login');
        await abrirPainel();
    } catch (e) {
        $('#carregando').textContent = e.message;
    }
}

aoEnviar($('#form-setup'), async f => {
    const d = Object.fromEntries(new FormData(f));
    if (d.senha !== d.senha2) throw new Error('As senhas não conferem.');
    const r = await api('POST', '/api/admin/setup', { codigo: d.codigo, usuario: d.usuario, senha: d.senha });
    csrf = r.csrf;
    f.reset();
    await abrirPainel();
});

aoEnviar($('#form-login'), async f => {
    const d = Object.fromEntries(new FormData(f));
    const r = await api('POST', '/api/admin/login', d);
    csrf = r.csrf;
    f.reset();
    await abrirPainel();
});

$('#btn-sair').addEventListener('click', async () => {
    try { await api('POST', '/api/admin/logout', {}); } catch { /* ignora */ }
    csrf = null;
    mostrar('tela-login');
});

async function abrirPainel() {
    mostrar('tela-painel');
    await Promise.all([carregarPosts(), carregarConfig()]);
    // As abas novas não podem impedir o painel de abrir, mesmo que a API falhe
    carregarRanking();
    carregarJogadores();
    irParaAba('posts');
}

/* ───────────── abas ───────────── */
function irParaAba(nome) {
    for (const a of ['posts', 'editor', 'ranking', 'estatisticas', 'aparencia', 'conta']) $('#aba-' + a).hidden = a !== nome;
    $$('#abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
    window.scrollTo(0, 0);
}
$('#abas').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.aba === 'editor') novaPublicacao(); else irParaAba(b.dataset.aba);
});

/* ───────────── lista de publicações ───────────── */
async function carregarPosts() {
    posts = await api('GET', '/api/admin/noticias');
    desenharPosts();
}

function desenharPosts() {
    const filtro = $('#busca-posts').value.trim().toLowerCase();
    const lista = $('#lista-posts');
    lista.replaceChildren();

    const dest = posts.filter(p => p.destaque && p.publicado !== false).length;
    $('#aviso-destaques').textContent = dest > 5
        ? `Atenção: ${dest} publicações estão marcadas para o carrossel, mas ele mostra só as 5 mais recentes.`
        : `${posts.length} publicações · ${dest} no carrossel da home (máximo 5).`;

    const visiveis = posts.filter(p => p.titulo.toLowerCase().includes(filtro));
    if (!visiveis.length) lista.append(el('p', { class: 'ajuda', text: 'Nenhuma publicação encontrada.' }));

    for (const p of visiveis) {
        const meta = el('div', { class: 'meta' }, el('span', { text: p.data }));
        meta.append(el('span', { class: 'selo' + (p.publicado === false ? ' rascunho' : ''), text: p.publicado === false ? 'Rascunho' : 'Publicado' }));
        if (p.destaque) meta.append(el('span', { class: 'selo destaque', text: 'Carrossel' }));

        const botoes = el('div', { class: 'botoes' },
            el('button', { class: 'secundario', type: 'button', text: 'Editar', onclick: () => editarPublicacao(p.id) }),
            p.publicado === false ? null : el('a', { class: 'botao-arquivo secundario', href: `/noticias/noticias.html?id=${p.id}`, target: '_blank', rel: 'noopener', text: 'Ver' }),
            el('button', { class: 'perigo', type: 'button', text: 'Excluir', onclick: () => excluirPublicacao(p) }));

        lista.append(el('div', { class: 'item' },
            el('img', { src: p.imagem, alt: '', loading: 'lazy' }),
            el('div', { class: 'info' }, el('strong', { text: p.titulo }), meta),
            botoes));
    }
}
$('#busca-posts').addEventListener('input', desenharPosts);
$('#btn-nova').addEventListener('click', novaPublicacao);

async function excluirPublicacao(p) {
    if (!confirm(`Excluir a publicação "${p.titulo}"?\n\nO servidor guarda cópias de segurança, mas a notícia sai do site.`)) return;
    try {
        await api('DELETE', `/api/admin/noticias/${p.id}`);
        await carregarPosts();
        avisar('Publicação excluída.');
    } catch (e) { alert(e.message); }
}

/* ───────────── editor ───────────── */
const formPost = $('#form-post');
const hoje = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

function definirImagem(campo, url) {
    const box = $(`[data-campo="${campo}"]`);
    box.dataset.valor = url || '';
    const img = $('img.mini', box);
    img.hidden = !url;
    if (url) img.src = url;
    const rem = $('[data-remover]', box);
    if (rem) rem.hidden = !url;
}
function preencherEditor(p) {
    formPost.reset();
    setErro(formPost, '');
    formPost.titulo.value = p.titulo || '';
    formPost.tituloLista.value = p.tituloLista || '';
    formPost.subtitulo.value = p.subtitulo || '';
    formPost.categoria.value = p.categoria ?? 'COPA DO MUNDO - FOOTBALL LIFE';
    formPost.dataISO.value = p.dataISO || hoje();
    formPost.texto.value = (p.paragrafos || []).join('\n\n');
    formPost.legenda.value = p.legenda || '';
    formPost.resumo.value = p.resumo || '';
    formPost.destaque.checked = !!p.destaque;
    formPost.publicado.value = p.publicado === false ? '0' : '1';
    definirImagem('imagem', p.imagem);
    definirImagem('imagemInfo', p.imagemInfo);
}
function novaPublicacao() {
    editandoId = null;
    $('#titulo-editor').textContent = 'Nova publicação';
    preencherEditor({});
    irParaAba('editor');
}
function editarPublicacao(id) {
    const p = posts.find(x => x.id === id);
    if (!p) return;
    editandoId = id;
    $('#titulo-editor').textContent = 'Editar publicação';
    preencherEditor(p);
    irParaAba('editor');
}
const btnCancelarPost = $('#btn-cancelar-post');
if (btnCancelarPost) btnCancelarPost.addEventListener('click', () => irParaAba('posts'));

$$('.campo-imagem').forEach(box => {
    const escolher = $('[data-escolher]', box);
    if (escolher && box.dataset.campo) {
        escolher.addEventListener('click', () => escolherImagem(url => definirImagem(box.dataset.campo, url)));
    }
    const rem = $('[data-remover]', box);
    if (rem && box.dataset.campo) {
        rem.addEventListener('click', () => definirImagem(box.dataset.campo, ''));
    }
});

aoEnviar(formPost, async f => {
    const imagem = $('[data-campo="imagem"]').dataset.valor;
    if (!imagem) throw new Error('Escolha a imagem principal.');
    const corpo = {
        titulo: f.titulo.value,
        tituloLista: f.tituloLista.value,
        subtitulo: f.subtitulo.value,
        categoria: f.categoria.value,
        dataISO: f.dataISO.value,
        imagem,
        paragrafos: f.texto.value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
        imagemInfo: $('[data-campo="imagemInfo"]').dataset.valor || '',
        legenda: f.legenda.value,
        resumo: f.resumo.value,
        destaque: f.destaque.checked,
        publicado: f.publicado.value === '1',
    };
    if (editandoId) await api('PUT', `/api/admin/noticias/${editandoId}`, corpo);
    else await api('POST', '/api/admin/noticias', corpo);
    await carregarPosts();
    irParaAba('posts');
    avisar(corpo.publicado ? 'Publicação salva e no ar!' : 'Rascunho salvo.');
});

/* ───────────── biblioteca de imagens ───────────── */
let aoEscolher = null;
let imagens = [];

function lerArquivo(arquivo) {
    return new Promise((ok, falha) => {
        if (arquivo.size > 3 * 1024 * 1024) return falha(new Error('A imagem passa de 3 MB (limite da hospedagem Vercel).'));
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = () => falha(new Error('Não consegui ler o arquivo.'));
        r.readAsDataURL(arquivo);
    });
}
async function enviarImagem(arquivo) {
    const dados = await lerArquivo(arquivo);
    const r = await api('POST', '/api/admin/upload', { nome: arquivo.name, dados });
    return r.url;
}

function desenharGrade() {
    const filtro = $('#filtro-imagens').value;
    const grade = $('#grade-imagens');
    grade.replaceChildren();
    const lista = imagens.filter(i =>
        filtro === 'todas' ? true :
        filtro === 'uploads' ? i.pasta === 'uploads' :
        filtro === 'flags' ? i.url.startsWith('/images/flags/') :
        i.pasta !== 'uploads' && !i.url.startsWith('/images/flags/'));
    lista.sort((a, b) => (b.pasta === 'uploads') - (a.pasta === 'uploads') || b.mtime - a.mtime);
    if (!lista.length) grade.append(el('p', { class: 'ajuda', text: 'Nenhuma imagem aqui ainda.' }));
    for (const i of lista) {
        grade.append(el('button', { type: 'button', title: i.nome, onclick: () => escolher(i.url) },
            el('img', { src: i.url, alt: '', loading: 'lazy' }), el('span', { text: i.nome })));
    }
}
function escolher(url) {
    $('#modal').hidden = true;
    const cb = aoEscolher; aoEscolher = null;
    if (cb) cb(url);
}
async function escolherImagem(callback, filtroInicial = 'todas') {
    aoEscolher = callback;
    setErro($('#modal'), '');
    $('#filtro-imagens').value = filtroInicial;
    $('#modal').hidden = false;
    try { imagens = await api('GET', '/api/admin/imagens'); desenharGrade(); }
    catch (e) { setErro($('#modal'), e.message); }
}
$('#filtro-imagens').addEventListener('change', desenharGrade);
$('#btn-fechar-modal').addEventListener('click', () => { $('#modal').hidden = true; aoEscolher = null; });
$('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal') { $('#modal').hidden = true; aoEscolher = null; } });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#modal').hidden) { $('#modal').hidden = true; aoEscolher = null; } });
$('#arquivo-upload').addEventListener('change', async ev => {
    const arq = ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    setErro($('#modal'), '');
    try { escolher(await enviarImagem(arq)); } catch (e) { setErro($('#modal'), e.message); }
});

/* ───────────── aparência ───────────── */
const corP = $('#cor-principal'), corPHex = $('#cor-principal-hex');
const corS = $('#cor-secundaria'), corSHex = $('#cor-secundaria-hex');
const usarS = $('#usar-secundaria');
let bandeiraAtual = BANDEIRA_PADRAO;

const hexOk = v => /^#[0-9a-fA-F]{6}$/.test(v);
function luminancia(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function atualizarPrevia() {
    const cor = hexOk(corPHex.value) ? corPHex.value : COR_PADRAO;
    $('#previa-nav').style.setProperty('--previa', cor);
    $('#aviso-contraste').hidden = luminancia(cor) < 0.6;
}
function ligarCor(seletor, texto, aoMudar) {
    seletor.addEventListener('input', () => { texto.value = seletor.value; aoMudar(); });
    texto.addEventListener('input', () => { if (hexOk(texto.value)) { seletor.value = texto.value; aoMudar(); } });
}
ligarCor(corP, corPHex, atualizarPrevia);
ligarCor(corS, corSHex, () => {});
usarS.addEventListener('change', () => { corS.disabled = corSHex.disabled = !usarS.checked; });
$('#btn-cores-padrao').addEventListener('click', () => {
    corP.value = corPHex.value = COR_PADRAO;
    usarS.checked = false; corS.disabled = corSHex.disabled = true;
    atualizarPrevia();
});

function mostrarBandeira(url) { bandeiraAtual = url; $('#previa-bandeira').src = url; }
async function carregarConfig() {
    config = await api('GET', '/api/admin/config');
    corP.value = corPHex.value = config.corPrincipal;
    usarS.checked = !!config.corSecundaria;
    corS.disabled = corSHex.disabled = !usarS.checked;
    corS.value = corSHex.value = config.corSecundaria || '#044c84';
    mostrarBandeira(config.bandeira);
    atualizarPrevia();
}
$('#arquivo-bandeira').addEventListener('change', async ev => {
    const arq = ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    const f = $('#form-aparencia');
    setErro(f, ''); setOk(f, '');
    try { mostrarBandeira(await enviarImagem(arq)); setOk(f, 'Bandeira carregada. Clique em “Salvar aparência” para publicar.'); }
    catch (e) { setErro(f, e.message); }
});
$('#btn-bandeira-biblioteca').addEventListener('click', () => escolherImagem(mostrarBandeira, 'flags'));
$('#btn-bandeira-padrao').addEventListener('click', () => mostrarBandeira(BANDEIRA_PADRAO));

aoEnviar($('#form-aparencia'), async f => {
    if (!hexOk(corPHex.value)) throw new Error('Cor principal inválida. Use o formato #RRGGBB.');
    if (usarS.checked && !hexOk(corSHex.value)) throw new Error('Cor secundária inválida. Use o formato #RRGGBB.');
    config = await api('PUT', '/api/admin/config', {
        corPrincipal: corPHex.value,
        corSecundaria: usarS.checked ? corSHex.value : null,
        bandeira: bandeiraAtual,
    });
    setOk(f, 'Aparência salva! Todas as páginas já usam as novas configurações.');
});

/* ───────────── ranking de copas ───────────── */
let ranking = [];            // cópia de trabalho (só vai pro site ao clicar em Salvar)
let rankingSujo = false;
let idTemp = -1;             // ids negativos = seleção nova (o servidor cria o id real)
let novaBandeira = '';

function intOuNaN(v) { return v === '' ? NaN : Number(v); }
function marcarRanking(sujo) {
    rankingSujo = sujo;
    $('#btn-salvar-ranking').textContent = sujo ? 'Salvar ranking (alterações pendentes)' : 'Salvar ranking';
}
async function carregarRanking() {
    try {
        const r = await api('GET', '/api/admin/ranking');
        ranking = r.selecoes.map(s => ({ id: s.id, nome: s.nome, bandeira: s.bandeira, julesRimet: s.julesRimet || 0, copas: s.copas || 0 }));
        marcarRanking(false);
        desenharRanking();
    } catch (e) { $('#erro-ranking').textContent = e.message; }
}
function desenharRanking() {
    const lista = $('#lista-ranking');
    lista.replaceChildren();
    if (!ranking.length) lista.append(el('p', { class: 'ajuda', text: 'Nenhuma seleção cadastrada.' }));
    ranking.forEach((s, i) => lista.append(linhaSelecao(s, i)));
}
function linhaSelecao(s, i) {
    const totalEl = el('span', { class: 'total-copas' });
    const linha = el('div', { class: 'sel-item' });
    const atualizar = () => {
        const t = (Number.isFinite(s.copas) ? s.copas : 0) + (Number.isFinite(s.julesRimet) ? s.julesRimet : 0);
        totalEl.replaceChildren('Total: ', el('strong', { text: String(t) }));
        linha.classList.toggle('sem-copas', t === 0);
    };
    const mexeu = () => { marcarRanking(true); linha.classList.add('alterado'); atualizar(); };

    const bandeiraImg = el('img', { src: s.bandeira, alt: '' });
    const bandeiraBtn = el('button', {
        type: 'button', class: 'bandeira-btn', title: 'Trocar bandeira',
        onclick: () => escolherImagem(url => { s.bandeira = url; bandeiraImg.src = url; mexeu(); }, 'flags'),
    }, bandeiraImg);

    const nome = el('input', { value: s.nome, maxlength: '60', 'aria-label': 'Nome da seleção' });
    nome.addEventListener('input', () => { s.nome = nome.value; mexeu(); });

    const copas = el('input', { type: 'number', min: '0', max: '99', value: String(s.copas), 'aria-label': `Copas de ${s.nome}` });
    const mudar = delta => { const v = (Number.isFinite(s.copas) ? s.copas : 0) + delta; s.copas = Math.min(99, Math.max(0, v)); copas.value = s.copas; mexeu(); };
    copas.addEventListener('input', () => { s.copas = intOuNaN(copas.value); mexeu(); });
    const contador = el('div', {},
        el('span', { class: 'mini-rotulo', text: 'Copas do Mundo' }),
        el('div', { class: 'contador' },
            el('button', { type: 'button', class: 'secundario', text: '−', title: 'Tirar uma copa', onclick: () => mudar(-1) }),
            copas,
            el('button', { type: 'button', class: 'primario', text: '+', title: 'Adicionar uma copa', onclick: () => mudar(1) })));

    const jules = el('input', { type: 'number', min: '0', max: '99', value: String(s.julesRimet), 'aria-label': 'Taças Jules Rimet' });
    jules.addEventListener('input', () => { s.julesRimet = intOuNaN(jules.value); mexeu(); });
    const julesCampo = el('div', {}, el('span', { class: 'mini-rotulo', text: 'Taça Jules Rimet' }), jules);

    const remover = el('button', {
        type: 'button', class: 'perigo', text: 'Remover',
        onclick: () => {
            if (!confirm(`Remover "${s.nome}" do ranking?`)) return;
            ranking = ranking.filter(x => x !== s);
            marcarRanking(true);
            desenharRanking();
        },
    });

    linha.append(el('span', { class: 'pos', text: String(i + 1) }), bandeiraBtn, nome, contador, julesCampo, totalEl, remover);
    atualizar();
    return linha;
}
$('#btn-nova-bandeira').addEventListener('click', () => escolherImagem(url => {
    novaBandeira = url;
    const img = $('#nova-bandeira'); img.src = url; img.hidden = false;
}, 'flags'));
aoEnviar($('#form-nova-selecao'), async f => {
    const nome = f.nome.value.trim();
    if (!nome) throw new Error('Informe o nome da seleção.');
    if (!novaBandeira) throw new Error('Escolha a bandeira da seleção.');
    if (ranking.some(s => s.nome.trim().toLowerCase() === nome.toLowerCase())) throw new Error('Essa seleção já está no ranking.');
    const copas = intOuNaN(f.copas.value);
    if (!Number.isInteger(copas) || copas < 0 || copas > 99) throw new Error('Copas: use um número entre 0 e 99.');
    ranking.push({ id: idTemp--, nome, bandeira: novaBandeira, julesRimet: 0, copas });
    f.reset(); f.copas.value = 0;
    novaBandeira = ''; $('#nova-bandeira').hidden = true;
    marcarRanking(true);
    desenharRanking();
    avisar('Seleção adicionada à lista. Clique em “Salvar ranking” para publicar.');
});
$('#btn-salvar-ranking').addEventListener('click', async ev => {
    $('#erro-ranking').textContent = ''; $('#ok-ranking').textContent = '';
    try {
        await comEnvio(ev.currentTarget, async () => {
            for (const s of ranking) {
                if (!s.nome.trim()) throw new Error('Toda seleção precisa de um nome.');
                for (const v of [s.copas, s.julesRimet]) {
                    if (!Number.isInteger(v) || v < 0 || v > 99) throw new Error(`Confira os números de ${s.nome} (use inteiros de 0 a 99).`);
                }
            }
            const r = await api('PUT', '/api/admin/ranking', { selecoes: ranking });
            ranking = r.selecoes.map(s => ({ id: s.id, nome: s.nome, bandeira: s.bandeira, julesRimet: s.julesRimet || 0, copas: s.copas || 0 }));
            marcarRanking(false);
            desenharRanking();
            $('#ok-ranking').textContent = 'Ranking salvo! A página Ranking do site já usa a nova classificação.';
        });
    } catch (e) { $('#erro-ranking').textContent = e.message; }
});

/* ───────────── estatísticas dos jogadores ───────────── */
const FOTO_PADRAO = '/Estatisticas/imagesProfile/outro.jpg';
let jogadores = [];
let jogadoresSujo = false;
let idTempJog = -1;

function marcarJogadores(sujo) {
    jogadoresSujo = sujo;
    $('#btn-salvar-stats').textContent = sujo ? 'Salvar estatísticas (alterações pendentes)' : 'Salvar estatísticas';
}
async function carregarJogadores() {
    try {
        const r = await api('GET', '/api/admin/estatisticas');
        jogadores = r.jogadores.map(j => ({ ...j }));
        marcarJogadores(false);
        desenharJogadores();
    } catch (e) { $('#erro-stats').textContent = e.message; }
}
function desenharJogadores() {
    const lista = $('#lista-jogadores');
    lista.replaceChildren();
    if (!jogadores.length) lista.append(el('p', { class: 'ajuda', text: 'Nenhum jogador cadastrado.' }));
    jogadores.forEach(j => lista.append(linhaJogador(j)));
    filtrarJogadores();
}
function linhaJogador(j) {
    const linha = el('div', { class: 'jog-item' });
    linha._j = j;
    const mexeu = () => { marcarJogadores(true); linha.classList.add('alterado'); };
    const campo = (rotulo, input) => el('label', {}, el('span', { class: 'mini-rotulo', text: rotulo }), input);

    const fotoImg = el('img', { src: j.foto || FOTO_PADRAO, alt: '' });
    const fotoBtn = el('button', {
        type: 'button', class: 'foto-btn', title: 'Trocar foto',
        onclick: () => escolherImagem(url => { j.foto = url; fotoImg.src = url; mexeu(); }),
    }, fotoImg);

    const nome = el('input', { value: j.nome, maxlength: '80' });
    nome.addEventListener('input', () => { j.nome = nome.value; mexeu(); });
    const selecao = el('input', { value: j.selecao || '', maxlength: '200' });
    selecao.addEventListener('input', () => { j.selecao = selecao.value; mexeu(); });
    const gols = el('input', { type: 'number', min: '0', max: '9999', value: String(j.gols) });
    gols.addEventListener('input', () => { j.gols = intOuNaN(gols.value); mexeu(); });
    const assist = el('input', { type: 'number', min: '0', max: '9999', value: String(j.assistencias) });
    assist.addEventListener('input', () => { j.assistencias = intOuNaN(assist.value); mexeu(); });

    const remover = el('button', {
        type: 'button', class: 'perigo remover', text: 'Remover',
        onclick: () => {
            if (!confirm(`Remover "${j.nome || 'este jogador'}" das estatísticas?`)) return;
            jogadores = jogadores.filter(x => x !== j);
            marcarJogadores(true);
            desenharJogadores();
        },
    });
    linha.append(fotoBtn, campo('Jogador', nome), campo('Seleção(ões)', selecao), campo('Gols', gols), campo('Assistências', assist), remover);
    return linha;
}
function filtrarJogadores() {
    const f = $('#busca-jogadores').value.trim().toLowerCase();
    $$('#lista-jogadores .jog-item').forEach(l => {
        l.hidden = !!f && !`${l._j.nome} ${l._j.selecao}`.toLowerCase().includes(f);
    });
}
$('#busca-jogadores').addEventListener('input', filtrarJogadores);
$('#btn-novo-jogador').addEventListener('click', () => {
    $('#busca-jogadores').value = '';
    jogadores.unshift({ id: idTempJog--, nome: '', foto: FOTO_PADRAO, selecao: '', gols: 0, assistencias: 0 });
    marcarJogadores(true);
    desenharJogadores();
    const primeira = $('#lista-jogadores .jog-item input');
    if (primeira) primeira.focus();
});
$('#btn-salvar-stats').addEventListener('click', async ev => {
    $('#erro-stats').textContent = ''; $('#ok-stats').textContent = '';
    try {
        await comEnvio(ev.currentTarget, async () => {
            for (const j of jogadores) {
                if (!j.nome.trim()) throw new Error('Todo jogador precisa de um nome.');
                for (const v of [j.gols, j.assistencias]) {
                    if (!Number.isInteger(v) || v < 0 || v > 9999) throw new Error(`Confira os números de ${j.nome} (inteiros de 0 a 9999).`);
                }
            }
            const r = await api('PUT', '/api/admin/estatisticas', { jogadores });
            jogadores = r.jogadores.map(j => ({ ...j }));
            marcarJogadores(false);
            desenharJogadores();
            $('#ok-stats').textContent = 'Estatísticas salvas! A página Estatísticas do site já usa os novos números.';
        });
    } catch (e) { $('#erro-stats').textContent = e.message; }
});

window.addEventListener('beforeunload', ev => {
    if (rankingSujo || jogadoresSujo) { ev.preventDefault(); ev.returnValue = ''; }
});

/* ───────────── conta ───────────── */
aoEnviar($('#form-senha'), async f => {
    const d = Object.fromEntries(new FormData(f));
    if (d.nova !== d.nova2) throw new Error('As novas senhas não conferem.');
    await api('POST', '/api/admin/senha', { atual: d.atual, nova: d.nova });
    f.reset();
    setOk(f, 'Senha alterada.');
});

iniciar();
