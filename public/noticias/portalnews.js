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

const pesquisa = document.querySelector("#pesquisa-noticia");
const lista = document.querySelector("#lista-noticias");


function semAcento(texto) {
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function desenharNoticias(noticias) {
    lista.innerHTML = "";

    noticias.forEach(noticia => {
        const a = document.createElement("a");
        a.href = "noticias.html?id=" + noticia.id + "&universo=" + (window.universoAtual || 1);
        a.className = "link-noticia";

        const div = document.createElement("div");
        div.className = "noticia";

        const img = document.createElement("img");
        img.src = noticia.imagem;
        img.alt = "";

        const h1 = document.createElement("h1");
        h1.textContent = noticia.tituloLista || noticia.titulo;

        div.appendChild(img);
        div.appendChild(h1);
        a.appendChild(div);
        lista.appendChild(a);
    });

    filtrar();
}

function filtrar() {
    const texto = semAcento(pesquisa.value);

    lista.querySelectorAll(".link-noticia").forEach(noticia => {
        const titulo = semAcento(noticia.querySelector("h1").textContent);

        noticia.style.display = titulo.includes(texto) ? "" : "none";
    });
}

pesquisa.addEventListener("input", filtrar);

if (Array.isArray(window.__NOTICIAS__)) {
    desenharNoticias(window.__NOTICIAS__);
} else {
    fetch(window.urlUniverso ? window.urlUniverso("/api/noticias") : "/api/noticias")
        .then(resposta => resposta.json())
        .then(desenharNoticias);
}
