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


const tabela = document.querySelector("#tabela-artilharia");
const filtro = document.querySelector("#ordenar");
let jogadores = [
    {
        foto: "/Estatisticas/imagesProfile/johnnyProfile.png",
        nome: "Johnny Schorros",
        selecao: "Macedônia do Norte, Moldávia, Somália, Timor-leste, Brunei, Gibraltar",
        gols: 152,
        assistencias: 34,
    },
    {
        foto: "/Estatisticas/imagesProfile/claudioProfile.png",
        nome: "Cláudio Goodbarras",
        selecao: "Cazaquistão, Panamá, Vietnã, San Marino, Gibraltar, Laos",
        gols: 99,
        assistencias: 43,
    },
    {
        foto: "/Estatisticas/imagesProfile/johnnyProfile.png",
        nome: "Johnny Schorros",
        selecao: "Cazaquistão, Panamá, Vietnã, San Marino, Gibraltar, Laos",
        gols: 89,
        assistencias: 61,
    },
    {
        foto: "/Estatisticas/imagesProfile/chowProfile.png",
        nome: "Hans Chow",
        selecao: "Somália, Timor-leste, Brunei",
        gols: 22,
        assistencias: 33,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Everto Camargo",
        selecao: "Macedônia do Norte, Moldávia, Brunei, Gibraltar",
        gols: 60,
        assistencias: 31,
    },
    {
        foto: "/Estatisticas/imagesProfile/clausioProfile.png",
        nome: "Cláusio Goodbarras",
        selecao: "San Marino",
        gols: 57,
        assistencias: 14,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Claudio Osorio",
        selecao: "Timor-Leste",
        gols: 2,
        assistencias: 11,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Matteo Vitaioli",
        selecao: "San Marino",
        gols: 3,
        assistencias: 26,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Freteliano",
        selecao: "Timor-Leste",
        gols: 0,
        assistencias: 5,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Marcello Mularoni",
        selecao: "San Marino",
        gols: 2,
        assistencias: 2,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Azwan Ali Rahman",
        selecao: "Brunei",
        gols: 0,
        assistencias: 1,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Faiq Bolkiah",
        selecao: "Brunei",
        gols: 0,
        assistencias: 1,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Chony Wenpaserth",
        selecao: "Laos",
        gols: 0,
        assistencias: 5,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Anousone Xaypanya",
        selecao: "Laos",
        gols: 0,
        assistencias: 4,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Mukhtar Suleiman",
        selecao: "Somália",
        gols: 0,
        assistencias: 4,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Zakariyah Nur",
        selecao: "Somália",
        gols: 0,
        assistencias: 3,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Enrico Golinucci",
        selecao: "San Marino",
        gols: 0,
        assistencias: 2,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Luca Ceccaroli",
        selecao: "San Marino",
        gols: 0,
        assistencias: 2,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "John Frith",
        selecao: "Timor-Leste",
        gols: 0,
        assistencias: 2,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Kian Ronan",
        selecao: "Gibraltar",
        gols: 2,
        assistencias: 3,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "James Scanlon",
        selecao: "Gibraltar",
        gols: 0,
        assistencias: 5,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Andrea Grandoni",
        selecao: "San Marino",
        gols: 0,
        assistencias: 1,
    },
    {
        foto: "/Estatisticas/imagesProfile/outro.jpg",
        nome: "Alessando Golinucci",
        selecao: "San Marino",
        gols: 0,
        assistencias: 1,
    }
];


function mostrarJogadores(lista) {
    tabela.replaceChildren();

    lista.forEach((jogador, indice) => {
        const linha = document.createElement("tr");

        let posicao;

        if (indice === 0) {
            posicao = "🥇";
        } else if (indice === 1) {
            posicao = "🥈";
        } else if (indice === 2) {
            posicao = "🥉";
        } else {
            posicao = indice + 1;
        }

        const tdPosicao = document.createElement("td");
        tdPosicao.textContent = posicao;

        const tdJogador = document.createElement("td");
        const foto = document.createElement("img");
        foto.src = jogador.foto;
        foto.alt = jogador.nome;
        tdJogador.append(foto, " " + jogador.nome);

        const tdSelecao = document.createElement("td");
        tdSelecao.textContent = jogador.selecao;

        const tdGols = document.createElement("td");
        tdGols.textContent = jogador.gols;

        const tdAssist = document.createElement("td");
        tdAssist.textContent = jogador.assistencias;

        linha.append(tdPosicao, tdJogador, tdSelecao, tdGols, tdAssist);
        tabela.appendChild(linha);
    });
}


// Mais gols (ou assistências, conforme o filtro) fica acima.
// Em empate, desempata pela outra estatística e depois pela ordem da lista.
function ordenarJogadores(criterio) {
    const outro = criterio === "gols" ? "assistencias" : "gols";
    const jogadoresOrdenados = [...jogadores];
    jogadoresOrdenados.sort((a, b) => {
        return (Number(b[criterio]) || 0) - (Number(a[criterio]) || 0)
            || (Number(b[outro]) || 0) - (Number(a[outro]) || 0);
    });

    mostrarJogadores(jogadoresOrdenados);
}

filtro.addEventListener("change", () => {
    ordenarJogadores(filtro.value);
})

ordenarJogadores("gols");


// Dados editáveis em /admin → aba "Estatísticas". Se a API falhar, a lista acima continua valendo.
async function carregarEstatisticas() {
    try {
        const resp = await fetch("/api/estatisticas", { cache: "no-store" });
        if (!resp.ok) return;
        const dados = await resp.json();
        if (!Array.isArray(dados.jogadores) || !dados.jogadores.length) return;
        jogadores = dados.jogadores;
        ordenarJogadores(filtro.value);   // mantém o filtro escolhido
    } catch (e) {
        /* sem API: mantém a lista padrão */
    }
}
carregarEstatisticas();


// const tabela = document.querySelector("#tabela-artilharia");

// jogadores.forEach(jogador => {

//     const linha = document.createElement("tr");

//     linha.innerHTML = `
//         <td>${jogador.posicao}</td>

//         <td>
//             <img src="${jogador.foto}" alt="${jogador.nome}">
//             ${jogador.nome}
//         </td>

//         <td>${jogador.selecao}</td>

//         <td>${jogador.gols}</td>

//         <td>${jogador.assistencias}</td>

//     `;

//     tabela.appendChild(linha);
// });