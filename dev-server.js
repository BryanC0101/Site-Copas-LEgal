'use strict';
/**
 * Servidor do Site das Copas (Node.js puro, sem dependências).
 *  - serve o site (pasta /public)
 *  - API pública de notícias / configuração visual
 *  - área de administração protegida por login (/admin)
 *
 * Iniciar:  node dev-server.js   (ou: npm start)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const copas = require('./lib/copas.js');

// ───────────────────────── Configuração ─────────────────────────
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const SEED = path.join(ROOT, 'dados-iniciais');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const BACKUPS = path.join(DATA, 'backups');
const F_NOTICIAS = path.join(DATA, 'noticias.json');
const F_CONFIG = path.join(DATA, 'config.json');
const F_ADMIN = path.join(DATA, 'admin.json');
const F_RANKING = path.join(DATA, 'ranking.json');
const F_STATS = path.join(DATA, 'estatisticas.json');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SESSAO_MS = 8 * 60 * 60 * 1000;          // 8 horas
const MAX_JSON = 12 * 1024 * 1024;             // corpo JSON (inclui imagens em base64)
const MAX_IMAGEM = 8 * 1024 * 1024;            // 8 MB por imagem
const BANDEIRA_PADRAO = '/images/flags/Flag_of_North_Macedonia.svg.webp';
const CONFIG_PADRAO = { bandeira: BANDEIRA_PADRAO, corPrincipal: '#d1b725', corSecundaria: null };

for (const d of [DATA, UPLOADS, BACKUPS]) fs.mkdirSync(d, { recursive: true });
for (const f of ['noticias.json', 'config.json', 'ranking.json', 'estatisticas.json']) {
  const dest = path.join(DATA, f);
  if (!fs.existsSync(dest) && fs.existsSync(path.join(SEED, f))) fs.copyFileSync(path.join(SEED, f), dest);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4',
};
const EXT_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

// ───────────────────────── Utilidades de dados ─────────────────────────
function lerJSON(arquivo, padrao) {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return padrao; }
}
function gravarJSON(arquivo, dados) {
  const tmp = arquivo + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}
function backupNoticias() {
  if (!fs.existsSync(F_NOTICIAS)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(F_NOTICIAS, path.join(BACKUPS, `noticias-${stamp}.json`));
  const todos = fs.readdirSync(BACKUPS).filter(f => f.startsWith('noticias-')).sort();
  for (const velho of todos.slice(0, Math.max(0, todos.length - 30))) fs.unlinkSync(path.join(BACKUPS, velho));
}
const getNoticias = () => lerJSON(F_NOTICIAS, []);
function salvarNoticias(lista) { backupNoticias(); gravarJSON(F_NOTICIAS, lista); }
function getConfig() { return { ...CONFIG_PADRAO, ...lerJSON(F_CONFIG, {}) }; }
function getRanking() { const d = lerJSON(F_RANKING, {}); return { proximaConquista: Number(d.proximaConquista) || 1, selecoes: Array.isArray(d.selecoes) ? d.selecoes : [] }; }
function getStats() { const d = lerJSON(F_STATS, {}); return { jogadores: Array.isArray(d.jogadores) ? d.jogadores : [] }; }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function dataExtenso(iso) {
  const [a, m, d] = iso.split('-');
  return `${d} ${MESES[Number(m) - 1]} ${a}`;
}
function hojeISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function ordenar(lista) {
  return [...lista].sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || '') || b.id - a.id);
}
function resumoPublico(n) {
  return {
    id: n.id, titulo: n.titulo, tituloLista: n.tituloLista || '', subtitulo: n.subtitulo || '', resumo: n.resumo || '',
    categoria: n.categoria || '', imagem: n.imagem, data: n.data, destaque: !!n.destaque,
  };
}
const publicadas = () => ordenar(getNoticias().filter(n => n.publicado !== false));

// ───────────────────────── Validação ─────────────────────────
const RE_CAMINHO_IMG = /^\/(?!\/)[^\s"'<>\\\x00-\x1f]*$/;
function caminhoImagemValido(v) {
  return typeof v === 'string' && v.length <= 300 && RE_CAMINHO_IMG.test(v) && !v.includes('..')
    && EXT_IMAGEM.has(path.extname(v.split('?')[0]).toLowerCase());
}
const RE_COR = /^#[0-9a-fA-F]{6}$/;
function texto(v, max) { return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : ''; }
function erro(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }

function validarNoticia(b, existente) {
  const titulo = texto(b.titulo, 250);
  if (!titulo) throw erro('Informe o título.');
  if (!caminhoImagemValido(b.imagem)) throw erro('Escolha a imagem principal.');
  let imagemInfo = '';
  if (b.imagemInfo) {
    if (!caminhoImagemValido(b.imagemInfo)) throw erro('Imagem secundária inválida.');
    imagemInfo = b.imagemInfo;
  }
  let dataISO = typeof b.dataISO === 'string' ? b.dataISO : (existente && existente.dataISO) || hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO) || isNaN(Date.parse(dataISO))) throw erro('Data inválida.');
  const paragrafos = (Array.isArray(b.paragrafos) ? b.paragrafos : [])
    .map(p => texto(p, 6000)).filter(Boolean).slice(0, 120);
  if (!paragrafos.length) throw erro('Escreva o texto da notícia.');
  return {
    id: existente ? existente.id : undefined,
    titulo, tituloLista: texto(b.tituloLista, 250), data: dataExtenso(dataISO), dataISO,
    categoria: texto(b.categoria, 100),
    imagem: b.imagem,
    resumo: texto(b.resumo, 400),
    subtitulo: texto(b.subtitulo, 700),
    paragrafos,
    imagemInfo,
    legenda: imagemInfo ? texto(b.legenda, 400) : '',
    destaque: !!b.destaque,
    publicado: b.publicado !== false,
  };
}

// ───────────────────────── Autenticação ─────────────────────────
const sessoes = new Map();       // token -> { csrf, exp, usuario }
const tentativas = new Map();    // ip -> { n, ate }
let codigoSetup = null;

function adminConfigurado() { return fs.existsSync(F_ADMIN); }
function novoCodigoSetup() {
  codigoSetup = crypto.randomBytes(5).toString('hex');
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' PRIMEIRO ACESSO: o administrador ainda não foi criado.');
  console.log(` Abra  http://${HOST === '0.0.0.0' ? 'SEU-SITE' : HOST}:${PORT}/admin/`);
  console.log(` e use este código de configuração:  ${codigoSetup}`);
  console.log('──────────────────────────────────────────────────────────\n');
}
function hashSenha(senha, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}
function conferirSenha(admin, usuario, senha) {
  const a = Buffer.from(String(usuario));
  const b = Buffer.from(admin.usuario);
  const usuarioOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  const { hash } = hashSenha(String(senha), admin.salt);   // sempre calcula (tempo constante)
  const h1 = Buffer.from(hash, 'hex'), h2 = Buffer.from(admin.hash, 'hex');
  return usuarioOk && h1.length === h2.length && crypto.timingSafeEqual(h1, h2);
}
function ipDe(req) {
  if (TRUST_PROXY) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'x';
}
function bloqueado(ip) {
  const t = tentativas.get(ip);
  return t && t.ate > Date.now() ? Math.ceil((t.ate - Date.now()) / 60000) : 0;
}
function falhou(ip) {
  const t = tentativas.get(ip) || { n: 0, ate: 0 };
  t.n += 1;
  if (t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; }
  tentativas.set(ip, t);
}
const esperar = ms => new Promise(r => setTimeout(r, ms));

function cookies(req) {
  const out = {};
  for (const par of String(req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
}
function https(req) {
  return !!req.socket.encrypted || process.env.COOKIE_SECURE === '1'
    || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
}
function sessaoDe(req) {
  const tok = cookies(req).sid;
  const s = tok && sessoes.get(tok);
  if (!s) return null;
  if (s.exp < Date.now()) { sessoes.delete(tok); return null; }
  return { tok, ...s };
}
function criarSessao(req, res, usuario) {
  const tok = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  sessoes.set(tok, { csrf, exp: Date.now() + SESSAO_MS, usuario });
  const flags = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${SESSAO_MS / 1000}`];
  if (https(req)) flags.push('Secure');
  res.setHeader('Set-Cookie', `sid=${tok}; ${flags.join('; ')}`);
  return { tok, csrf };
}
setInterval(() => { const n = Date.now(); for (const [k, v] of sessoes) if (v.exp < n) sessoes.delete(k); }, 10 * 60 * 1000).unref();

// ───────────────────────── Respostas HTTP ─────────────────────────
function cabecalhosBase(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}
function json(res, status, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(corpo) });
  res.end(corpo);
}
function lerCorpo(req, limite = MAX_JSON) {
  return new Promise((resolve, reject) => {
    const partes = []; let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > limite) { reject(erro('Arquivo grande demais.', 413)); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}
async function lerJSONCorpo(req) {
  if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw erro('Tipo de conteúdo inválido.', 415);
  const buf = await lerCorpo(req);
  try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { throw erro('JSON inválido.'); }
}

// ───────────────────────── Arquivos estáticos ─────────────────────────
function injetarScript(html, dados) {
  const s = JSON.stringify(dados).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  return html.replace('</head>', `<script>window.__NOTICIAS__=${s};</script></head>`);
}
function servirArquivo(req, res, arquivo, opcoes = {}) {
  fs.stat(arquivo, (err, st) => {
    if (err || !st.isFile()) return naoEncontrado(res);
    const ext = path.extname(arquivo).toLowerCase();
    const tipo = MIME[ext] || 'application/octet-stream';
    const cab = { 'Content-Type': tipo };
    if (opcoes.cabecalhos) Object.assign(cab, opcoes.cabecalhos);

    const rel = path.relative(PUBLIC, arquivo).split(path.sep).join('/');
    const dinamica = !opcoes.cabecalhos && (rel === 'index.html' || rel === 'noticias/portalnews.html');
    if (dinamica) {
      let html = fs.readFileSync(arquivo, 'utf8');
      if (rel === 'index.html') {
        const cfg = getConfig();
        if (cfg.bandeira !== BANDEIRA_PADRAO) html = html.split(BANDEIRA_PADRAO).join(cfg.bandeira);
      }
      html = injetarScript(html, publicadas().map(resumoPublico));
      cab['Cache-Control'] = 'no-cache';
      cab['Content-Length'] = Buffer.byteLength(html);
      res.writeHead(200, cab);
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    cab['ETag'] = etag;
    cab['Cache-Control'] = cab['Cache-Control'] || 'no-cache';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, cab); return res.end(); }
    cab['Content-Length'] = st.size;
    res.writeHead(200, cab);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(arquivo).pipe(res);
  });
}
function naoEncontrado(res) {
  const corpo = '<!DOCTYPE html><meta charset="utf-8"><title>Não encontrado</title><h1>404 — Página não encontrada</h1><p><a href="/">Voltar ao início</a></p>';
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(corpo);
}
function caminhoSeguro(base, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0')) return null;
  const alvo = path.normalize(path.join(base, p));
  if (alvo !== base && !alvo.startsWith(base + path.sep)) return null;
  if (path.relative(base, alvo).split(path.sep).some(seg => seg.startsWith('.'))) return null;
  return alvo;
}

// ───────────────────────── Imagens ─────────────────────────
function detectarImagem(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.toString('latin1', 0, 4) === 'GIF8') return '.gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  const ini = buf.toString('utf8', 0, Math.min(buf.length, 2048)).trimStart().toLowerCase();
  if (ini.startsWith('<svg') || (ini.startsWith('<?xml') && ini.includes('<svg'))) {
    const todo = buf.toString('utf8').toLowerCase();
    if (/<script|javascript:|<foreignobject|\son[a-z]+\s*=|<iframe|<embed|<object/.test(todo)) throw erro('Este SVG contém código ativo e foi recusado por segurança.');
    return '.svg';
  }
  return null;
}
function listarImagens() {
  const out = [];
  const varrer = (dirAbs, prefixoUrl, pasta) => {
    let itens = [];
    try { itens = fs.readdirSync(dirAbs, { withFileTypes: true }); } catch { return; }
    for (const it of itens) {
      if (it.name.startsWith('.')) continue;
      if (it.isDirectory()) varrer(path.join(dirAbs, it.name), `${prefixoUrl}/${it.name}`, it.name);
      else if (EXT_IMAGEM.has(path.extname(it.name).toLowerCase())) {
        const st = fs.statSync(path.join(dirAbs, it.name));
        out.push({ url: `${prefixoUrl}/${it.name}`, nome: it.name, pasta, mtime: st.mtimeMs });
      }
    }
  };
  varrer(path.join(PUBLIC, 'images'), '/images', 'images');
  varrer(path.join(PUBLIC, 'noticias'), '/noticias', 'noticias');
  varrer(path.join(PUBLIC, 'Estatisticas', 'imagesProfile'), '/Estatisticas/imagesProfile', 'imagesProfile');
  varrer(UPLOADS, '/uploads', 'uploads');
  return out;
}

// ───────────────────────── API pública ─────────────────────────
function temaCSS() {
  const c = getConfig();
  let css = `:root{--cor-nav:${RE_COR.test(c.corPrincipal) ? c.corPrincipal : CONFIG_PADRAO.corPrincipal};`;
  if (c.corSecundaria && RE_COR.test(c.corSecundaria)) css += `--cor-secundaria:${c.corSecundaria};`;
  return css + '}\n';
}

async function rotaPublica(req, res, url) {
  const p = url.pathname;
  if (p === '/tema.css') {
    const css = temaCSS();
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(css), true;
  }
  if (p === '/api/noticias') return json(res, 200, publicadas().map(resumoPublico)), true;
  const m = p.match(/^\/api\/noticias\/(\d+)$/);
  if (m) {
    const n = getNoticias().find(x => x.id === Number(m[1]) && x.publicado !== false);
    return n ? json(res, 200, n) : json(res, 404, { erro: 'Notícia não encontrada.' }), true;
  }
  if (p === '/api/ranking') return json(res, 200, { selecoes: copas.comTotal(getRanking().selecoes) }), true;
  if (p === '/api/estatisticas') return json(res, 200, getStats()), true;
  if (p === '/api/config') {
    const c = getConfig();
    return json(res, 200, { bandeira: c.bandeira, corPrincipal: c.corPrincipal, corSecundaria: c.corSecundaria }), true;
  }
  return false;
}

// ───────────────────────── API do administrador ─────────────────────────
async function rotaAdmin(req, res, url) {
  const p = url.pathname;
  const metodo = req.method;
  const ip = ipDe(req);

  // Proteção contra requisições vindas de outros sites
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    const origem = req.headers.origin;
    if (origem) {
      let host = ''; try { host = new URL(origem).host; } catch { /* ignora */ }
      if (host !== req.headers.host) throw erro('Origem não permitida.', 403);
    }
  }

  if (p === '/api/admin/status' && metodo === 'GET') {
    const s = sessaoDe(req);
    if (!adminConfigurado() && !codigoSetup) novoCodigoSetup();
    return json(res, 200, { configurado: adminConfigurado(), logado: !!s, usuario: s ? s.usuario : null, csrf: s ? s.csrf : null }), true;
  }

  if (p === '/api/admin/setup' && metodo === 'POST') {
    if (adminConfigurado()) throw erro('O administrador já foi criado.', 409);
    const min = bloqueado(ip);
    if (min) throw erro(`Muitas tentativas. Tente novamente em ${min} min.`, 429);
    const b = await lerJSONCorpo(req);
    if (!codigoSetup) novoCodigoSetup();
    const a = Buffer.from(String(b.codigo || '').trim()), c = Buffer.from(codigoSetup);
    if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) { falhou(ip); await esperar(500); throw erro('Código de configuração incorreto.', 403); }
    const usuario = texto(b.usuario, 40);
    const senha = String(b.senha || '');
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(usuario)) throw erro('Usuário: 3 a 40 caracteres (letras, números, ponto, hífen ou _).');
    if (senha.length < 10) throw erro('A senha precisa ter pelo menos 10 caracteres.');
    const { salt, hash } = hashSenha(senha);
    gravarJSON(F_ADMIN, { usuario, salt, hash, criadoEm: new Date().toISOString() });
    codigoSetup = null;
    const s = criarSessao(req, res, usuario);
    return json(res, 200, { ok: true, csrf: s.csrf }), true;
  }

  if (p === '/api/admin/login' && metodo === 'POST') {
    if (!adminConfigurado()) throw erro('Administrador ainda não configurado.', 409);
    const min = bloqueado(ip);
    if (min) throw erro(`Muitas tentativas. Tente novamente em ${min} min.`, 429);
    const b = await lerJSONCorpo(req);
    const admin = lerJSON(F_ADMIN, null);
    if (!admin || !conferirSenha(admin, b.usuario || '', b.senha || '')) {
      falhou(ip); await esperar(600);
      throw erro('Usuário ou senha incorretos.', 401);
    }
    tentativas.delete(ip);
    const s = criarSessao(req, res, admin.usuario);
    return json(res, 200, { ok: true, csrf: s.csrf, usuario: admin.usuario }), true;
  }

  // ── a partir daqui: exige sessão ──
  const s = sessaoDe(req);
  if (!s) throw erro('Sessão expirada. Entre novamente.', 401);
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    const t = Buffer.from(String(req.headers['x-csrf-token'] || '')), e = Buffer.from(s.csrf);
    if (t.length !== e.length || !crypto.timingSafeEqual(t, e)) throw erro('Token de segurança inválido. Recarregue a página.', 403);
  }

  if (p === '/api/admin/logout' && metodo === 'POST') {
    sessoes.delete(s.tok);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return json(res, 200, { ok: true }), true;
  }

  if (p === '/api/admin/noticias' && metodo === 'GET') {
    return json(res, 200, ordenar(getNoticias())), true;
  }
  if (p === '/api/admin/noticias' && metodo === 'POST') {
    const lista = getNoticias();
    const nova = validarNoticia(await lerJSONCorpo(req), null);
    nova.id = lista.reduce((m, n) => Math.max(m, n.id), 0) + 1;
    lista.push(nova);
    salvarNoticias(lista);
    return json(res, 201, nova), true;
  }
  const mn = p.match(/^\/api\/admin\/noticias\/(\d+)$/);
  if (mn) {
    const id = Number(mn[1]);
    const lista = getNoticias();
    const i = lista.findIndex(n => n.id === id);
    if (i < 0) throw erro('Notícia não encontrada.', 404);
    if (metodo === 'PUT') {
      const atual = validarNoticia(await lerJSONCorpo(req), lista[i]);
      lista[i] = atual;
      salvarNoticias(lista);
      return json(res, 200, atual), true;
    }
    if (metodo === 'DELETE') {
      lista.splice(i, 1);
      salvarNoticias(lista);
      return json(res, 200, { ok: true }), true;
    }
  }

  if (p === '/api/admin/imagens' && metodo === 'GET') return json(res, 200, listarImagens()), true;

  if (p === '/api/admin/upload' && metodo === 'POST') {
    const b = await lerJSONCorpo(req);
    const base64 = String(b.dados || '').replace(/^data:[^,]*,/, '');
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) throw erro('Arquivo vazio.');
    if (buf.length > MAX_IMAGEM) throw erro('A imagem passa de 8 MB.', 413);
    const ext = detectarImagem(buf);
    if (!ext) throw erro('Formato não suportado. Use PNG, JPG, GIF, WEBP ou SVG.');
    const slug = String(b.nome || 'imagem').replace(/\.[^.]*$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'imagem';
    const nome = `${slug}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(UPLOADS, nome), buf);
    return json(res, 201, { url: `/uploads/${nome}`, nome }), true;
  }

  if (p === '/api/admin/config' && metodo === 'GET') return json(res, 200, getConfig()), true;
  if (p === '/api/admin/config' && metodo === 'PUT') {
    const b = await lerJSONCorpo(req);
    const atual = getConfig();
    if (b.bandeira !== undefined) {
      if (!caminhoImagemValido(b.bandeira)) throw erro('Bandeira inválida.');
      atual.bandeira = b.bandeira;
    }
    if (b.corPrincipal !== undefined) {
      if (!RE_COR.test(b.corPrincipal)) throw erro('Cor principal inválida.');
      atual.corPrincipal = b.corPrincipal.toLowerCase();
    }
    if (b.corSecundaria !== undefined) {
      if (b.corSecundaria !== null && !RE_COR.test(b.corSecundaria)) throw erro('Cor secundária inválida.');
      atual.corSecundaria = b.corSecundaria ? b.corSecundaria.toLowerCase() : null;
    }
    gravarJSON(F_CONFIG, atual);
    return json(res, 200, atual), true;
  }

  if (p === '/api/admin/ranking' && metodo === 'GET') return json(res, 200, { selecoes: copas.comTotal(getRanking().selecoes) }), true;
  if (p === '/api/admin/ranking' && metodo === 'PUT') {
    const dados = copas.validarRanking(await lerJSONCorpo(req), getRanking());
    gravarJSON(F_RANKING, dados);
    return json(res, 200, { selecoes: copas.comTotal(dados.selecoes) }), true;
  }
  if (p === '/api/admin/estatisticas' && metodo === 'GET') return json(res, 200, getStats()), true;
  if (p === '/api/admin/estatisticas' && metodo === 'PUT') {
    const dados = copas.validarJogadores(await lerJSONCorpo(req), getStats());
    gravarJSON(F_STATS, dados);
    return json(res, 200, dados), true;
  }

  if (p === '/api/admin/senha' && metodo === 'POST') {
    const b = await lerJSONCorpo(req);
    const admin = lerJSON(F_ADMIN, null);
    const min = bloqueado(ip);
    if (min) throw erro(`Muitas tentativas. Tente novamente em ${min} min.`, 429);
    if (!admin || !conferirSenha(admin, admin.usuario, b.atual || '')) { falhou(ip); await esperar(600); throw erro('Senha atual incorreta.', 403); }
    const nova = String(b.nova || '');
    if (nova.length < 10) throw erro('A nova senha precisa ter pelo menos 10 caracteres.');
    const { salt, hash } = hashSenha(nova);
    gravarJSON(F_ADMIN, { ...admin, salt, hash, alteradoEm: new Date().toISOString() });
    for (const [tok] of sessoes) if (tok !== s.tok) sessoes.delete(tok);   // derruba outras sessões
    return json(res, 200, { ok: true }), true;
  }

  return false;
}

// ───────────────────────── Roteador ─────────────────────────
const CSP_ADMIN = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const servidor = http.createServer(async (req, res) => {
  cabecalhosBase(res);
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (p.startsWith('/api/admin/')) {
      res.setHeader('X-Frame-Options', 'DENY');
      const tratou = await rotaAdmin(req, res, url);
      if (!tratou) json(res, 404, { erro: 'Rota não encontrada.' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { erro: 'Método não permitido.' });
    if (await rotaPublica(req, res, url)) return;
    if (p.startsWith('/api/')) return json(res, 404, { erro: 'Rota não encontrada.' });

    if (p === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }

    if (p.startsWith('/uploads/')) {
      const arq = caminhoSeguro(UPLOADS, p.slice('/uploads/'.length));
      if (!arq || !EXT_IMAGEM.has(path.extname(arq).toLowerCase())) return naoEncontrado(res);
      return servirArquivo(req, res, arq, { cabecalhos: { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
    }

    let arq = caminhoSeguro(PUBLIC, p);
    if (!arq) return naoEncontrado(res);
    if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) arq = path.join(arq, 'index.html');
    const ehAdmin = p.startsWith('/admin/');
    if (ehAdmin) {
      return servirArquivo(req, res, arq, { cabecalhos: { 'Content-Security-Policy': CSP_ADMIN, 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store' } });
    }
    servirArquivo(req, res, arq);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) json(res, status, { erro: status === 500 ? 'Erro interno do servidor.' : e.message });
    else res.end();
  }
});

servidor.listen(PORT, HOST, () => {
  console.log(`Site das Copas rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Painel de administração:  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/admin/`);
  if (!adminConfigurado()) novoCodigoSetup();
});
