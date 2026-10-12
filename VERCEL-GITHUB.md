# Publicação da administração no Vercel com commits automáticos

Esta versão mantém o site estático em `public/` e usa `api/index.js` como API serverless. Alterações de aparência e notícias são gravadas em `dados-publicados/` no repositório GitHub por meio da API Contents. Cada gravação cria um commit; a integração GitHub→Vercel deve estar conectada à branch configurada.

## Antes de publicar

1. Faça backup do repositório e confirme que o Vercel está conectado ao repositório correto.
2. Envie estes arquivos para a branch de produção (por padrão, `main`).
3. No Vercel, abra **Project → Settings → Environment Variables** e configure as variáveis abaixo para Production (e Preview se for testar em previews).
4. Faça um novo deploy após salvar as variáveis.

| Variável | Valor |
|---|---|
| `GITHUB_TOKEN` | Token fine-grained do GitHub com acesso **Contents: Read and write** somente ao repositório do site. Nunca coloque no frontend. |
| `GITHUB_OWNER` | `BryanC0101` (ou o proprietário real do repositório) |
| `GITHUB_REPO` | `Site-Copas-LEgal` (confirme o nome exato do repositório conectado ao Vercel) |
| `GITHUB_BRANCH` | `main` (ou a branch de produção do Vercel) |
| `ADMIN_USERNAME` | Nome de usuário administrativo inicial |
| `ADMIN_PASSWORD` | Senha administrativa inicial, com pelo menos 10 caracteres |
| `ADMIN_SESSION_SECRET` | Segredo aleatório longo, exclusivo para assinar sessões |
| `ADMIN_CREDENTIALS_KEY` | Segredo aleatório longo e exclusivo para criptografar a senha quando alterada pelo painel |

Gere os dois segredos com um gerador seguro de senhas (32 bytes ou mais). Não os salve no código nem os envie em mensagens públicas. Guarde uma cópia segura: perder `ADMIN_CREDENTIALS_KEY` impede decifrar a credencial administrativa armazenada criptografada no repositório.

## Como fica o fluxo

- `PUT /api/admin/config`: grava `dados-publicados/config.json` e cria um commit.
- `POST/PUT/DELETE /api/admin/noticias`: grava `dados-publicados/noticias.json` e cria um commit.
- `PUT /api/admin/ranking`: grava `dados-publicados/ranking.json` e cria um commit (leitura pública em `GET /api/ranking`).
- `PUT /api/admin/estatisticas`: grava `dados-publicados/estatisticas.json` e cria um commit (leitura pública em `GET /api/estatisticas`).
- `POST /api/admin/upload`: grava a imagem em `public/uploads/` e cria um commit. Por causa do limite de payload de funções serverless, uploads pelo painel são limitados a 3 MB por arquivo.
- `POST /api/admin/senha`: salva a credencial cifrada em `dados-publicados/admin.enc.json`; o segredo de cifragem permanece somente nas variáveis de ambiente.
- Cada commit na branch de produção aciona o deploy automático do Vercel, se a integração estiver conectada e os deployments automáticos estiverem habilitados.

## Notas importantes

- Os dados iniciais são lidos de `dados-iniciais/config.json` e `dados-iniciais/noticias.json` até serem salvos pela primeira vez em `dados-publicados/`.
- `data/` continua ignorada pelo Git para não publicar dados locais/sensíveis. Os arquivos versionados da administração ficam em `dados-publicados/`.
- Os uploads enviados pela administração entram no histórico do Git. Para uma biblioteca de mídia muito grande, o ideal futuro é mover as imagens para armazenamento de objetos e manter os commits de conteúdo separados.
- O painel não pode fazer um commit diretamente no disco do seu computador. Ele cria o commit no GitHub; para atualizar sua cópia local, abra o terminal do projeto no VS Code e execute `git pull origin main` (ou use Source Control → Sync Changes).
- A API usa sessões assinadas e cookies `HttpOnly`, validação CSRF e verificação de origem. Configure o projeto para usar HTTPS.
- Se o repositório já tiver uma versão mais nova de `dados-iniciais`, ela será usada como conteúdo inicial somente enquanto `dados-publicados/` não existir no GitHub.
