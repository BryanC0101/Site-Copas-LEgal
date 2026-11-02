# Site das Copas — com área de administração

## Como rodar no seu computador
1. Instale o **Node.js** (versão 18 ou mais nova): https://nodejs.org
2. Abra um terminal nesta pasta e rode:  `node dev-server.js`  (ou dê dois cliques em `iniciar.bat` no Windows)
3. Abra  http://localhost:3000  → o site
4. Abra  http://localhost:3000/admin/  → a administração

**Primeiro acesso:** o terminal mostra um *código de configuração*. Digite-o na tela do `/admin/`, escolha usuário e
senha (mínimo 10 caracteres) e pronto. Esse código só existe até o administrador ser criado.

Não precisa instalar nada além do Node (nenhum `npm install`).

## O que dá para fazer no /admin/
- **Publicações:** criar, editar, excluir; salvar como *rascunho*; marcar para aparecer no **carrossel da home**
  (máximo 5, as mais recentes); imagem principal e imagem do rodapé enviadas direto do seu computador.
- **Aparência:** cor principal e cor secundária (valem para **todas** as páginas de uma vez) e a **bandeira da “Campeã mundial”**.
- **Ranking de Copas:** botões **+ / −** para somar copas de cada seleção, adicionar ou remover seleções e trocar bandeiras.
  Ao salvar, o ranking do site se reorganiza sozinho (mais copas = mais acima; em empate, quem chegou primeiro fica na frente).
- **Estatísticas:** editar gols, assistências, nome, seleção e foto de cada jogador, adicionar ou remover jogadores. A página
  pública continua com o filtro Gols/Assistências e ordena automaticamente pelo critério escolhido.
- **Conta:** trocar senha.

## Executar localmente ou publicar no Vercel

- Para testar localmente, use `node dev-server.js`; a versão local guarda os dados na pasta `data/`.
- Para publicar no Vercel com a administração funcionando e criando commits no GitHub, configure a API serverless incluída neste projeto. Siga o guia `VERCEL-GITHUB.md` e configure todas as variáveis de ambiente antes de usar o painel publicado.
- Use HTTPS em produção. Não publique o arquivo `.env`, tokens ou segredos.

## Segurança (resumo)
Senha com hash scrypt + salt · sessão em cookie HttpOnly/SameSite=Strict (Secure em HTTPS) · token anti-CSRF ·
bloqueio de 15 min após 5 tentativas erradas · uploads validados pelo conteúdo real do arquivo (PNG/JPG/GIF/WEBP/SVG,
até 8 MB; SVG com script é recusado) · arquivos enviados são servidos com CSP `sandbox` · textos nunca são inseridos como HTML ·
a pasta `data/` e o código do servidor não são acessíveis pelo navegador.

**Esqueceu a senha?** Pare o servidor, apague o arquivo `data/admin.json` e inicie de novo: um novo código de
configuração aparece no terminal.

## Estrutura
```
dev-server.js       servidor (site + API + admin)
lib/copas.js         regras do ranking de copas e das estatísticas (usado pelo servidor local e pela API do Vercel)
public/              o site (mesmas URLs de antes: /images, /noticias, /Ranking…)
public/admin/        painel de administração
dados-iniciais/      notícias e configurações originais (copiadas para data/ no primeiro início)
data/                criada automaticamente: notícias, uploads, senha, backups  (não vai pro Git)
public/_legado/      as páginas antigas noticias/1 e noticias/2 (não eram usadas por nenhum link)
```


## Hospedagem no Vercel com administração e commits automáticos

O projeto inclui uma API serverless em `api/index.js` e `vercel.json`. No Vercel, o painel usa a API do GitHub para registrar as alterações em commits. Consulte `VERCEL-GITHUB.md` para configurar as variáveis de ambiente e permissões.

**Variáveis obrigatórias no Vercel:** `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` e `ADMIN_CREDENTIALS_KEY`. O token precisa ter permissão de leitura e gravação de Contents apenas no repositório deste site. Nunca coloque tokens ou segredos em arquivos públicos.

Os arquivos versionados pelo painel ficam em `dados-publicados/`; os uploads feitos pelo painel ficam em `public/uploads/`. Os uploads são limitados a 3 MB. Depois de uma alteração no painel, o commit é criado no GitHub e o Vercel publica quando a integração e os deploys automáticos estão habilitados. Para sincronizar a cópia do VS Code, use `git pull origin main` (ajuste a branch se necessário).
