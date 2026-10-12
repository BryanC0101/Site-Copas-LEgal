'use strict';
// API serverless do Site das Copas. Os dados versionados são gravados no GitHub
// pela API Contents, gerando commits que acionam o deploy do Vercel.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Regras do Ranking de Copas e das Estatísticas (embutidas aqui para a API não depender de outro arquivo).
const copas = require('../lib/copas');

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const SEED = path.join(ROOT, 'dados-iniciais');
const OWNER = process.env.GITHUB_OWNER || 'BryanC0101';
const REPO = process.env.GITHUB_REPO || 'Site-Copas-LEgal';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN || '';
const USERNAME = process.env.ADMIN_USERNAME || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const DATA_DIR = 'dados-publicados';
const CONFIG_PATH = `${DATA_DIR}/config.json`;
const NEWS_PATH = `${DATA_DIR}/noticias.json`;
const ADMIN_PATH = `${DATA_DIR}/admin.enc.json`;
const RANKING_PATH = `${DATA_DIR}/ranking.json`;
const STATS_PATH = `${DATA_DIR}/estatisticas.json`;
const CREDENTIALS_KEY = process.env.ADMIN_CREDENTIALS_KEY || '';
const MAX_IMAGE = 3 * 1024 * 1024; // cabe com folga no limite de payload de funções Vercel
const DEFAULT_CONFIG = { bandeira: '/images/flags/Flag_of_North_Macedonia.svg.webp', corPrincipal: '#d1b725', corSecundaria: null };
const EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const COLOR = /^#[0-9a-f]{6}$/i;
const COOKIE = 'copas_admin';

function response(res, status, data, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function text(v, max) { return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : ''; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function dateLabel(iso) { const [y,m,d] = iso.split('-'); return `${d} ${MONTHS[Number(m)-1]} ${y}`; }
function sortNews(items) { return [...items].sort((a,b) => (b.dataISO||'').localeCompare(a.dataISO||'') || Number(b.id)-Number(a.id)); }
function validImage(url) { return typeof url === 'string' && url.length <= 300 && /^\/(?!\/)[^\s"'<>\\\x00-\x1f]*$/.test(url) && !url.includes('..') && EXT.has(path.extname(url.split('?')[0]).toLowerCase()); }
function validateNews(body, existing) {
  const title = text(body.titulo, 250);
  if (!title) fail('Informe o título.');
  if (!validImage(body.imagem)) fail('Escolha uma imagem principal.');
  let imageInfo = '';
  if (body.imagemInfo) { if (!validImage(body.imagemInfo)) fail('Imagem secundária inválida.'); imageInfo = body.imagemInfo; }
  const dateISO = typeof body.dataISO === 'string' ? body.dataISO : (existing && existing.dataISO) || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || Number.isNaN(Date.parse(dateISO))) fail('Data inválida.');
  const paragraphs = (Array.isArray(body.paragrafos) ? body.paragrafos : []).map(p => text(p, 6000)).filter(Boolean).slice(0,120);
  if (!paragraphs.length) fail('Escreva o texto da notícia.');
  return { id: existing ? existing.id : undefined, titulo:title, tituloLista:text(body.tituloLista,250), data:dateLabel(dateISO), dataISO: dateISO, categoria:text(body.categoria,100), imagem:body.imagem, resumo:text(body.resumo,400), subtitulo:text(body.subtitulo,700), paragrafos:paragraphs, imagemInfo:imageInfo, legenda:imageInfo?text(body.legenda,400):'', destaque:!!body.destaque, publicado:body.publicado !== false };
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks=[]; let size=0;
    req.on('data', c => { size += c.length; if (size > 4.2*1024*1024) { reject(Object.assign(new Error('A requisição é grande demais.'),{status:413})); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('JSON inválido.'),{status:400})); } });
    req.on('error', reject);
  });
}
function cookies(req) { return Object.fromEntries(String(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>{const i=s.indexOf('=');return i<0?[s,'']:[s.slice(0,i),decodeURIComponent(s.slice(i+1))]})); }
function sign(payload) { const data = Buffer.from(JSON.stringify(payload)).toString('base64url'); const mac = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url'); return `${data}.${mac}`; }
function verify(req) {
  if (!SESSION_SECRET) return null;
  const token = cookies(req)[COOKIE]; if (!token || !token.includes('.')) return null;
  const [data, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest();
  let actual; try { actual = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try { const p = JSON.parse(Buffer.from(data,'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
function csrfOk(req, session) { const supplied = Buffer.from(String(req.headers['x-csrf-token']||'')); const expected = Buffer.from(String(session.csrf||'')); return supplied.length === expected.length && expected.length > 0 && crypto.timingSafeEqual(supplied, expected); }
function secureCookie(req) { return req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production'; }
function setSession(res, req, user) {
  const csrf = crypto.randomBytes(24).toString('hex');
  const value = sign({ user, csrf, exp: Date.now()+8*60*60*1000 });
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie(req)?'; Secure':''}`);
  return csrf;
}
function clearSession(res, req) { res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie(req)?'; Secure':''}`); }
function authConfigured() { return !!(USERNAME && PASSWORD && SESSION_SECRET && CREDENTIALS_KEY && TOKEN); }
function encryptionKey() { return crypto.createHash('sha256').update(CREDENTIALS_KEY).digest(); }
function encryptCredentials(value) {
  const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')},null,2)+'\n';
}
function decryptCredentials(record) {
  if(!record)return {usuario:USERNAME,senha:PASSWORD};
  try { const d=typeof record==='string'?JSON.parse(record):record; const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(d.iv,'base64')); decipher.setAuthTag(Buffer.from(d.tag,'base64')); const clear=Buffer.concat([decipher.update(Buffer.from(d.data,'base64')),decipher.final()]).toString('utf8'); return JSON.parse(clear); }
  catch { fail('Não foi possível ler as credenciais administrativas criptografadas. Confira ADMIN_CREDENTIALS_KEY.',500); }
}
async function getCredentials() { const stored=await readRepoJSON(ADMIN_PATH,null); return decryptCredentials(stored); }
function safeEqual(a,b) { const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b)); return aa.length===bb.length && aa.length>0 && crypto.timingSafeEqual(aa,bb); }

async function gh(pathname, options = {}) {
  if (!TOKEN) fail('Integração GitHub não configurada. Configure GITHUB_TOKEN no Vercel.', 503);
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${pathname.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { ...options, headers: { Accept:'application/vnd.github+json', Authorization:`Bearer ${TOKEN}`, 'X-GitHub-Api-Version':'2022-11-28', ...(options.headers||{}) } });
  if (r.status === 404) return null;
  const data = await r.json().catch(()=>({}));
  if (!r.ok) { const e = new Error(data.message || `GitHub respondeu ${r.status}.`); e.status = r.status === 409 || r.status === 422 ? 409 : 502; throw e; }
  return data;
}
async function readRepoJSON(file, fallback) {
  const item = await gh(file);
  if (!item) return fallback;
  try { return JSON.parse(Buffer.from(item.content.replace(/\n/g,''),'base64').toString('utf8')); }
  catch { fail(`O arquivo ${file} no GitHub contém JSON inválido.`, 500); }
}
async function writeRepoFile(file, content, message, expectedSha) {
  // O SHA evita sobrescrever silenciosamente uma edição concorrente.
  let old = expectedSha;
  if (old === undefined) { const current = await gh(file); old = current && current.sha; }
  const body = { message, content: Buffer.from(content).toString('base64'), branch: BRANCH };
  if (old) body.sha = old;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${file.split('/').map(encodeURIComponent).join('/')}`;
  const r = await fetch(url,{method:'PUT',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) { const e = new Error(r.status===409||r.status===422?'O arquivo foi alterado por outra operação. Recarregue os dados e tente novamente.':(data.message||`Falha ao gravar no GitHub (${r.status}).`)); e.status = r.status===409||r.status===422?409:502; throw e; }
  return data;
}
async function seedJSON(file, fallback) {
  const fromRepo=await readRepoJSON(file,null); if(fromRepo!==null)return fromRepo;
  try{return JSON.parse(fs.readFileSync(path.join(SEED,file.split('/').pop()),'utf8'));}catch{return fallback;}
}
async function getConfig() { return { ...DEFAULT_CONFIG, ...(await seedJSON(CONFIG_PATH,{})) }; }
async function getNews() { return await seedJSON(NEWS_PATH,[]); }
async function getRanking() { const d = await seedJSON(RANKING_PATH,{}); return { proximaConquista: Number(d.proximaConquista)||1, selecoes: Array.isArray(d.selecoes)?d.selecoes:[] }; }
async function getStats() { const d = await seedJSON(STATS_PATH,{}); return { jogadores: Array.isArray(d.jogadores)?d.jogadores:[] }; }
function summarize(n) { return {id:n.id,titulo:n.titulo,tituloLista:n.tituloLista||'',subtitulo:n.subtitulo||'',resumo:n.resumo||'',categoria:n.categoria||'',imagem:n.imagem,data:n.data,destaque:!!n.destaque}; }
async function theme(res) { const c=await getConfig(); let css=`:root{--cor-nav:${COLOR.test(c.corPrincipal)?c.corPrincipal:DEFAULT_CONFIG.corPrincipal};`; if(c.corSecundaria&&COLOR.test(c.corSecundaria))css+=`--cor-secundaria:${c.corSecundaria};`; res.statusCode=200;res.setHeader('Content-Type','text/css; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(css+'}\n'); }
function detectImage(buf) {
  if(buf.length<12)return null;
  if(buf[0]===0x89&&buf.toString('latin1',1,4)==='PNG')return '.png';
  if(buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff)return '.jpg';
  if(buf.toString('latin1',0,4)==='GIF8')return '.gif';
  if(buf.toString('latin1',0,4)==='RIFF'&&buf.toString('latin1',8,12)==='WEBP')return '.webp';
  const start=buf.toString('utf8',0,Math.min(buf.length,2048)).trimStart().toLowerCase();
  if(start.startsWith('<svg')||(start.startsWith('<?xml')&&start.includes('<svg'))){const all=buf.toString('utf8').toLowerCase();if(/<script|javascript:|<foreignobject|\son[a-z]+\s*=|<iframe|<embed|<object/.test(all))fail('SVG com conteúdo ativo recusado.');return '.svg';}
  return null;
}
function slug(s) { return String(s||'imagem').replace(/\.[^.]*$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'imagem'; }
function localImages() {
  const result=[];
  function walk(dir,url,pasta){let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return};for(const ent of entries){if(ent.name.startsWith('.'))continue;const abs=path.join(dir,ent.name);if(ent.isDirectory())walk(abs,`${url}/${ent.name}`,ent.name);else if(EXT.has(path.extname(ent.name).toLowerCase())){let st;try{st=fs.statSync(abs)}catch{continue}result.push({url:`${url}/${ent.name}`,nome:ent.name,pasta,mtime:st.mtimeMs});}}}
  walk(path.join(PUBLIC,'images'),'/images','images'); walk(path.join(PUBLIC,'noticias'),'/noticias','noticias'); walk(path.join(PUBLIC,'Estatisticas','imagesProfile'),'/Estatisticas/imagesProfile','imagesProfile'); return result;
}
async function imageList() {
  const list=localImages(); const dir=`${PUBLIC.replace(/\\/g,'/')}/uploads`;
  const r=await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/uploads?ref=${encodeURIComponent(BRANCH)}`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${TOKEN}`,'X-GitHub-Api-Version':'2022-11-28'}});
  if(r.ok){const files=await r.json();for(const f of files.filter(x=>x.type==='file'&&EXT.has(path.extname(x.name).toLowerCase())))list.push({url:`/uploads/${f.name}`,nome:f.name,pasta:'uploads',mtime:Date.parse(f.last_modified||'')||0});}
  else if(r.status!==404) throw Object.assign(new Error('Não foi possível listar os uploads no GitHub.'),{status:502});
  return list;
}
function publicOriginCheck(req) { const origin=req.headers.origin; if(!origin)return; let host='';try{host=new URL(origin).host}catch{} if(host!==req.headers.host)fail('Origem não permitida.',403); }

module.exports = async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin'); res.setHeader('X-Frame-Options','SAMEORIGIN');
  try {
    const url = new URL(req.url, 'https://vercel.invalid');
    const p = url.searchParams.get('path') || url.pathname;
    const method = req.method || 'GET';
    if (p === '/tema.css' && (method==='GET'||method==='HEAD')) return await theme(res);
    if (p === '/api/noticias' && method==='GET') { const ns=sortNews((await getNews()).filter(n=>n.publicado!==false)); return response(res,200,ns.map(summarize)); }
    const publicNews=p.match(/^\/api\/noticias\/(\d+)$/);
    if(publicNews&&method==='GET'){const n=(await getNews()).find(x=>x.id===Number(publicNews[1])&&x.publicado!==false);return response(res,n?200:404,n||{erro:'Notícia não encontrada.'});}
    if(p==='/api/ranking'&&method==='GET'){const d=await getRanking();return response(res,200,{selecoes:copas.comTotal(d.selecoes)});}
    if(p==='/api/estatisticas'&&method==='GET')return response(res,200,await getStats());
    if(p==='/api/config'&&method==='GET'){const c=await getConfig();return response(res,200,{bandeira:c.bandeira,corPrincipal:c.corPrincipal,corSecundaria:c.corSecundaria});}
    if(!p.startsWith('/api/admin/'))return response(res,404,{erro:'Rota não encontrada.'});
    if(method!=='GET'&&method!=='HEAD')publicOriginCheck(req);

    if(p==='/api/admin/status'&&method==='GET'){
      const s=verify(req); return response(res,200,{configurado:true,logado:!!s,usuario:s?s.user:null,csrf:s?s.csrf:null,integracaoConfigurada:authConfigured()});
    }
    if(p==='/api/admin/login'&&method==='POST'){
      if(!authConfigured())return response(res,503,{erro:'A administração ainda não está configurada. Defina GITHUB_TOKEN, ADMIN_USERNAME, ADMIN_PASSWORD e ADMIN_SESSION_SECRET nas variáveis de ambiente do Vercel.'});
      const b=await parseBody(req); const credentials=await getCredentials(); if(!safeEqual(b.usuario,credentials.usuario)||!safeEqual(b.senha,credentials.senha))return response(res,401,{erro:'Usuário ou senha incorretos.'});
      const csrf=setSession(res,req,credentials.usuario);return response(res,200,{ok:true,csrf,usuario:credentials.usuario});
    }
    if(p==='/api/admin/setup'&&method==='POST')return response(res,410,{erro:'O primeiro acesso é configurado com ADMIN_USERNAME e ADMIN_PASSWORD nas variáveis de ambiente do Vercel.'});
    const session=verify(req); if(!session)return response(res,401,{erro:'Sessão expirada. Entre novamente.'});
    if(method!=='GET'&&method!=='HEAD'&&!csrfOk(req,session))return response(res,403,{erro:'Token de segurança inválido. Recarregue a página.'});
    if(p==='/api/admin/logout'&&method==='POST'){clearSession(res,req);return response(res,200,{ok:true});}
    if(p==='/api/admin/config'&&method==='GET')return response(res,200,await getConfig());
    if(p==='/api/admin/config'&&method==='PUT'){
      const b=await parseBody(req);const current=await getConfig();
      if(b.bandeira!==undefined){if(!validImage(b.bandeira))fail('Bandeira inválida.');current.bandeira=b.bandeira;}
      if(b.corPrincipal!==undefined){if(!COLOR.test(b.corPrincipal))fail('Cor principal inválida.');current.corPrincipal=b.corPrincipal.toLowerCase();}
      if(b.corSecundaria!==undefined){if(b.corSecundaria!==null&&!COLOR.test(b.corSecundaria))fail('Cor secundária inválida.');current.corSecundaria=b.corSecundaria?b.corSecundaria.toLowerCase():null;}
      await writeRepoFile(CONFIG_PATH,JSON.stringify(current,null,2)+'\n',`Admin: atualizar aparência (${new Date().toISOString()})`);return response(res,200,current);
    }
    if(p==='/api/admin/noticias'&&method==='GET')return response(res,200,sortNews(await getNews()));
    if(p==='/api/admin/noticias'&&method==='POST'){
      const list=await getNews();const n=validateNews(await parseBody(req),null);n.id=list.reduce((m,x)=>Math.max(m,Number(x.id)||0),0)+1;list.push(n);
      await writeRepoFile(NEWS_PATH,JSON.stringify(list,null,2)+'\n',`Admin: criar notícia #${n.id}`);return response(res,201,n);
    }
    const newsMatch=p.match(/^\/api\/admin\/noticias\/(\d+)$/);
    if(newsMatch){const id=Number(newsMatch[1]);const list=await getNews();const i=list.findIndex(n=>Number(n.id)===id);if(i<0)return response(res,404,{erro:'Notícia não encontrada.'});
      if(method==='PUT'){const n=validateNews(await parseBody(req),list[i]);list[i]=n;await writeRepoFile(NEWS_PATH,JSON.stringify(list,null,2)+'\n',`Admin: editar notícia #${id}`);return response(res,200,n);}
      if(method==='DELETE'){list.splice(i,1);await writeRepoFile(NEWS_PATH,JSON.stringify(list,null,2)+'\n',`Admin: excluir notícia #${id}`);return response(res,200,{ok:true});}}
    if(p==='/api/admin/imagens'&&method==='GET')return response(res,200,await imageList());
    if(p==='/api/admin/upload'&&method==='POST'){
      const b=await parseBody(req);const base64=String(b.dados||'').replace(/^data:[^,]*,/,'');const buf=Buffer.from(base64,'base64');if(!buf.length)fail('Arquivo vazio.');if(buf.length>MAX_IMAGE)fail('Para o upload pela administração, use imagens de até 3 MB.',413);
      const ext=detectImage(buf);if(!ext)fail('Formato não suportado. Use PNG, JPG, GIF, WEBP ou SVG.');const name=`${slug(b.nome)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      await writeRepoFile(`public/uploads/${name}`,buf,`Admin: enviar imagem ${name}`);return response(res,201,{url:`/uploads/${name}`,nome:name});
    }
    if(p==='/api/admin/ranking'&&method==='GET'){const d=await getRanking();return response(res,200,{selecoes:copas.comTotal(d.selecoes)});}
    if(p==='/api/admin/ranking'&&method==='PUT'){
      const dados=copas.validarRanking(await parseBody(req),await getRanking());
      await writeRepoFile(RANKING_PATH,JSON.stringify(dados,null,2)+'\n',`Admin: atualizar ranking de campeões (${new Date().toISOString()})`);return response(res,200,{selecoes:copas.comTotal(dados.selecoes)});
    }
    if(p==='/api/admin/estatisticas'&&method==='GET')return response(res,200,await getStats());
    if(p==='/api/admin/estatisticas'&&method==='PUT'){
      const dados=copas.validarJogadores(await parseBody(req),await getStats());
      await writeRepoFile(STATS_PATH,JSON.stringify(dados,null,2)+'\n',`Admin: atualizar estatísticas dos jogadores (${new Date().toISOString()})`);return response(res,200,dados);
    }
    if(p==='/api/admin/senha'&&method==='POST'){
      const b=await parseBody(req); const current=await getCredentials();
      if(!safeEqual(b.atual,current.senha))return response(res,403,{erro:'Senha atual incorreta.'});
      const next=String(b.nova||'');if(next.length<10)return response(res,400,{erro:'A nova senha precisa ter pelo menos 10 caracteres.'});
      await writeRepoFile(ADMIN_PATH,encryptCredentials({usuario:current.usuario,senha:next,alteradoEm:new Date().toISOString()}),'Admin: alterar senha administrativa');
      return response(res,200,{ok:true});
    }
    return response(res,404,{erro:'Rota não encontrada.'});
  } catch(e) { console.error('[site-copas-api]',e.message); return response(res,e.status||500,{erro:e.status&&e.status<500?e.message:(e.status===409?e.message:'Falha ao processar a solicitação. Confira as variáveis do Vercel, as permissões do GitHub e tente novamente.')}); }
};
