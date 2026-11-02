'use strict';
// Regras do Ranking de Copas e das Estatísticas de jogadores.
// Usado tanto pela API do Vercel (api/index.js) quanto pelo servidor local (dev-server.js).
const path = require('node:path');

const EXT_IMG = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const FOTO_PADRAO = '/Estatisticas/imagesProfile/outro.jpg';
const MAX_SELECOES = 100;
const MAX_JOGADORES = 300;

function falha(msg, status = 400) { const e = new Error(msg); e.status = status; throw e; }
function texto(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function imagemValida(url) {
  return typeof url === 'string' && url.length <= 300 && /^\/(?!\/)[^\s"'<>\\\x00-\x1f]*$/.test(url)
    && !url.includes('..') && EXT_IMG.has(path.extname(url.split('?')[0]).toLowerCase());
}
function inteiro(v, min, max, rotulo) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) falha(`${rotulo}: use um número inteiro entre ${min} e ${max}.`);
  return n;
}
const total = s => (s.julesRimet || 0) + (s.copas || 0);

// Mais títulos fica acima. Em empate, quem chegou àquele número primeiro fica na frente
// (ultimaConquista menor = conquista mais antiga; 0 = campeões "originais"), depois a ordem de cadastro.
function ordenarRanking(lista) {
  return [...lista].sort((a, b) =>
    total(b) - total(a) || (a.ultimaConquista || 0) - (b.ultimaConquista || 0) || a.id - b.id);
}
function comTotal(lista) { return ordenarRanking(lista).map(s => ({ ...s, total: total(s) })); }

function proximosIds(existentes) { let m = existentes.reduce((x, n) => Math.max(x, n), 0); return () => ++m; }

function validarRanking(corpo, anterior) {
  if (!corpo || !Array.isArray(corpo.selecoes)) falha('Lista de seleções inválida.');
  if (corpo.selecoes.length > MAX_SELECOES) falha(`No máximo ${MAX_SELECOES} seleções.`);
  const antes = new Map(((anterior && anterior.selecoes) || []).map(s => [s.id, s]));
  const todosIds = [...antes.keys(), ...corpo.selecoes.map(s => Number(s && s.id) || 0)];
  const novoId = proximosIds(todosIds);
  let proxima = Math.max(Number(anterior && anterior.proximaConquista) || 1,
    ...[...antes.values()].map(s => (s.ultimaConquista || 0) + 1));
  const usados = new Set(), nomes = new Set(), saida = [];
  for (const bruto of corpo.selecoes) {
    if (!bruto || typeof bruto !== 'object') falha('Seleção inválida.');
    const nome = texto(bruto.nome, 60);
    if (!nome) falha('Toda seleção precisa de um nome.');
    const chave = nome.toLocaleLowerCase('pt-BR');
    if (nomes.has(chave)) falha(`A seleção "${nome}" aparece duas vezes.`);
    nomes.add(chave);
    if (!imagemValida(bruto.bandeira)) falha(`Escolha a bandeira de ${nome}.`);
    const copas = inteiro(bruto.copas, 0, 99, `Copas de ${nome}`);
    const julesRimet = inteiro(bruto.julesRimet === undefined ? 0 : bruto.julesRimet, 0, 99, `Taças Jules Rimet de ${nome}`);
    let id = Number(bruto.id);
    if (!Number.isInteger(id) || id < 1 || usados.has(id)) id = novoId();
    usados.add(id);
    const prev = antes.get(id);
    let ultima = prev ? (prev.ultimaConquista || 0) : 0;
    if (total({ copas, julesRimet }) > (prev ? total(prev) : 0)) ultima = proxima++;   // subiu de títulos → "carimba" a data
    saida.push({ id, nome, bandeira: bruto.bandeira, julesRimet, copas, ultimaConquista: ultima });
  }
  return { proximaConquista: proxima, selecoes: saida };
}

function validarJogadores(corpo, anterior) {
  if (!corpo || !Array.isArray(corpo.jogadores)) falha('Lista de jogadores inválida.');
  if (corpo.jogadores.length > MAX_JOGADORES) falha(`No máximo ${MAX_JOGADORES} jogadores.`);
  const novoId = proximosIds([...((anterior && anterior.jogadores) || []).map(j => j.id), ...corpo.jogadores.map(j => Number(j && j.id) || 0)]);
  const usados = new Set(), saida = [];
  for (const b of corpo.jogadores) {
    if (!b || typeof b !== 'object') falha('Jogador inválido.');
    const nome = texto(b.nome, 80);
    if (!nome) falha('Todo jogador precisa de um nome.');
    let id = Number(b.id);
    if (!Number.isInteger(id) || id < 1 || usados.has(id)) id = novoId();
    usados.add(id);
    saida.push({
      id, nome,
      foto: imagemValida(b.foto) ? b.foto : FOTO_PADRAO,
      selecao: texto(b.selecao, 200),
      gols: inteiro(b.gols, 0, 9999, `Gols de ${nome}`),
      assistencias: inteiro(b.assistencias, 0, 9999, `Assistências de ${nome}`),
    });
  }
  return { jogadores: saida };
}

module.exports = { ordenarRanking, comTotal, validarRanking, validarJogadores, FOTO_PADRAO };
