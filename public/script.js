const principal = document.querySelector("#principal")
const images = document.querySelectorAll("#principal img")
const observer = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
        if(entry.isIntersecting){
            entry.target.classList.add("show");
        }else {
            entry.target.classList.remove("show");
        }
    })
}, {
    threshold:0.3
})
images.forEach(img=>observer.observe(img));


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





const categoria = document.querySelector("#categoria");
const titulo = document.querySelector("#titulo");
const descricao = document.querySelector("#descricao");
const imagem = document.querySelector("#imagem-noticia");
const link = document.querySelector("#link-noticia");
const containerBarras = document.querySelector(".barras-noticias");

let barras = document.querySelectorAll(".barra");
let noticiaAtual = 0;
let noticias = [];
let temporizador = null;
if (Number(window.universoAtual) === 2 && principal) principal.hidden = true;

// Notícias em destaque (carrossel da home) vêm da área de administração.
function destaquesDe(lista) {
    return lista
        .filter(n => n.destaque)
        .slice(0, 5)
        .map(n => ({
            categoria: n.categoria || "",
            titulo: n.titulo,
            descricao: n.resumo || n.subtitulo || "",
            imagem: n.imagem,
            link: "/noticias/noticias.html?id=" + n.id + "&universo=" + (window.universoAtual || 1)
        }));
}

function mostrarNoticia(indice) {
    const noticia = noticias[indice];

    categoria.textContent = noticia.categoria;
    titulo.textContent = noticia.titulo;
    descricao.textContent = noticia.descricao;
    imagem.src = noticia.imagem;
    link.href = noticia.link;

    barras.forEach(barra => barra.classList.remove("ativa"));
    barras[indice].classList.add("ativa");
}

function trocarNoticia() {
    noticiaAtual++;

    if (noticiaAtual >= noticias.length) {
        noticiaAtual = 0;
    }

    mostrarNoticia(noticiaAtual);
}

function iniciarCarrossel(lista) {
    noticias = destaquesDe(lista);

    // No universo 2, não exibe o conteúdo estático legado do universo 1.
    if (noticias.length === 0) {
        if (Number(window.universoAtual) === 2 && principal) principal.hidden = true;
        return;
    }
    if (principal) principal.hidden = false;

    containerBarras.innerHTML = "";
    noticias.forEach(() => {
        const barra = document.createElement("span");
        barra.className = "barra";
        containerBarras.appendChild(barra);
    });
    barras = containerBarras.querySelectorAll(".barra");

    noticiaAtual = 0;
    mostrarNoticia(0);

    clearInterval(temporizador);
    if (noticias.length > 1) {
        temporizador = setInterval(trocarNoticia, 6000);
    }
}

if (Array.isArray(window.__NOTICIAS__)) {
    iniciarCarrossel(window.__NOTICIAS__);
} else {
    fetch(window.urlUniverso ? window.urlUniverso("/api/noticias") : "/api/noticias")
        .then(resposta => resposta.json())
        .then(iniciarCarrossel)
        .catch(() => { /* mantém o conteúdo estático */ });
}

// A bandeira escolhida na administração é carregada da configuração publicada.
fetch(window.urlUniverso ? window.urlUniverso("/api/config") : "/api/config")
    .then(r => { if (!r.ok) throw new Error("configuração indisponível"); return r.json(); })
    .then(config => {
        if (!config || !config.bandeira) return;
        document.querySelectorAll('img[src="/images/flags/Flag_of_North_Macedonia.svg.webp"]').forEach(img => {
            img.src = config.bandeira;
        });
    })
    .catch(() => {});
