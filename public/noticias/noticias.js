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



const parametros = new URLSearchParams(window.location.search);

const id = Number(parametros.get("id"));


fetch(window.urlUniverso ? window.urlUniverso("/api/noticias/" + encodeURIComponent(id)) : ("/api/noticias/" + encodeURIComponent(id)))
    .then(resposta => {
        if (!resposta.ok) return null;
        return resposta.json();
    })
    .then(noticia => {

        if (!noticia) {
            document.querySelector("main").innerHTML =
                "<h1>Notícia não encontrada.</h1>";

            return;
        }


        document.title = noticia.titulo;


        document.querySelector("#titulo").textContent =
            noticia.titulo;

        document.querySelector("#data").textContent =
            noticia.data;

        document.querySelector("#imagem-principal").src =
            noticia.imagem;

        document.querySelector("#imagem-principal").alt =
            noticia.titulo;

        document.querySelector("#subtitulo").textContent =
            noticia.subtitulo;


        const conteudo = document.querySelector("#conteudo");

        noticia.paragrafos.forEach(paragrafo => {

            const p = document.createElement("p");

            p.textContent = paragrafo;

            conteudo.appendChild(p);

        });


        if (noticia.imagemInfo) {

            document.querySelector("#imagem-info").src =
                noticia.imagemInfo;

            document.querySelector("#legenda").textContent =
                noticia.legenda;

        } else {

            document.querySelector(".imagem-info").style.display =
                "none";

        }

    });