/* Seletor global dos universos. Os dados permanecem isolados no servidor. */
(() => {
  const KEY = 'siteCopasUniverso';
  const params = new URLSearchParams(location.search);
  const informado = Number(params.get('universo'));
  let atual = informado === 2 ? 2 : (informado === 1 ? 1 : (localStorage.getItem(KEY) === '2' ? 2 : 1));
  localStorage.setItem(KEY, String(atual));
  window.universoAtual = atual;
  window.urlUniverso = url => {
    const u = new URL(url, location.origin);
    u.searchParams.set('universo', String(window.universoAtual || 1));
    return u.pathname + u.search + u.hash;
  };
  function criarSeletor() {
    const menu = document.querySelector('#menu');
    if (!menu || menu.querySelector('.seletor-universo')) return;
    const wrap = document.createElement('label');
    wrap.className = 'seletor-universo';
    wrap.append(document.createTextNode('Universo '));
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Selecionar universo');
    select.innerHTML = '<option value="1">Universo 1</option><option value="2">Universo 2</option>';
    select.value = String(atual);
    select.addEventListener('change', () => {
      atual = Number(select.value) === 2 ? 2 : 1;
      localStorage.setItem(KEY, String(atual));
      const u = new URL(location.href);
      u.searchParams.set('universo', String(atual));
      location.href = u.pathname + u.search + u.hash;
    });
    wrap.append(select);
    menu.prepend(wrap);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', criarSeletor);
  else criarSeletor();
  // Mantém o universo ao navegar entre as páginas do próprio site.
  document.addEventListener('click', ev => {
    const a = ev.target.closest('a[href]');
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || a.target === '_blank') return;
    let u; try { u = new URL(a.href, location.href); } catch { return; }
    if (u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
    u.searchParams.set('universo', String(window.universoAtual || 1));
    a.href = u.pathname + u.search + u.hash;
  }, true);
})();
