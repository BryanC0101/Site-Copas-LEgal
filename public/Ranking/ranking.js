const hamburger = document.querySelector("#hamburger");
const menu = document.querySelector("#menu");

hamburger.addEventListener("click", () => {
    menu.classList.toggle("ativo");

    if (menu.classList.contains("ativo")) {
        hamburger.textContent = "✕";
    } else {
        hamburger.textContent = "☰";
    }
});


/* ── Ranking dinâmico ──
   Os dados vêm da API (editados em /admin → aba "Ranking de Copas").
   Se a API falhar ou vier vazia, continua valendo o HTML que já está na página. */
function criarSelecao(sel) {
    const bloco = document.createElement("div");
    bloco.className = "selecao";

    const nome = document.createElement("h1");
    nome.textContent = sel.nome;

    const bandeira = document.createElement("img");
    bandeira.src = sel.bandeira;
    bandeira.alt = "";

    const copas = document.createElement("div");
    copas.className = "cups";

    const taca = (id, src) => {
        const img = document.createElement("img");
        img.id = id;           // o CSS atual usa #julesrimet e #copadomundo
        img.src = src;
        img.alt = "";
        copas.appendChild(img);
    };
    for (let i = 0; i < (sel.julesRimet || 0); i++) taca("julesrimet", "/images/julesrimet.png");
    for (let i = 0; i < (sel.copas || 0); i++) taca("copadomundo", "/images/copadomundo.png");

    bloco.append(nome, bandeira, copas);
    return bloco;
}

async function carregarRanking() {
    try {
        const resp = await fetch("/api/ranking", { cache: "no-store" });
        if (!resp.ok) return;
        const dados = await resp.json();
        const lista = (dados.selecoes || []).filter(s => (s.julesRimet || 0) + (s.copas || 0) > 0);
        if (!lista.length) return;
        const tabela = document.querySelector(".tabela");
        if (!tabela) return;
        tabela.replaceChildren(...lista.map(criarSelecao));
    } catch (e) {
        /* sem API: mantém o ranking estático */
    }
}
carregarRanking();

