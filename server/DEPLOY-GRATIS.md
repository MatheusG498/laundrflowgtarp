# Deploy GRÁTIS do servidor LaundrFlow (custo zero)

Tudo aqui usa **planos gratuitos**. Nenhum cartão obrigatório para começar.

> Recomendado: **Render (grátis)** — deploy via Git, bem simples.
> O único porém do plano grátis do Render: o servidor "dorme" após ~15 min sem uso
> e leva ~30-50s para acordar na primeira chamada. Para uma equipe de staff, é tranquilo.
> Se quiser que nunca durma, veja a alternativa **Fly.io** no fim.

---

## Parte 1 — MongoDB Atlas (grátis, tier M0)

1. Crie conta em https://www.mongodb.com/cloud/atlas e um cluster **M0 (Free)**.
2. **Database Access** → crie um usuário de banco com senha (anote a senha).
3. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`).
   (O IP do PaaS é dinâmico; o acesso continua protegido pelo usuário/senha do banco e pelo login da API.)
4. **Connect → Drivers** → copie a connection string. Fica assim:
   `mongodb+srv://SEU_USUARIO:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   Troque `<password>` pela senha real do usuário do banco.

## Parte 2 — Colocar o código no GitHub

1. Crie um repositório no GitHub (pode ser privado).
2. Suba o projeto. O importante é que a pasta `server/` e o arquivo `render.yaml` (na raiz) subam.
   Se você usa Git pela primeira vez, na raiz do projeto:
   ```bash
   git init
   git add .
   git commit -m "LaundrFlow"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git push -u origin main
   ```

## Parte 3 — Deploy no Render (grátis)

### Opção A — Blueprint (usa o render.yaml, mais fácil)
1. Crie conta em https://render.com (pode logar com o GitHub).
2. **New +** → **Blueprint** → conecte o repositório.
3. O Render lê o `render.yaml` e já configura tudo. Ele vai pedir os valores marcados:
   - `MONGODB_URI` → cole a string do Atlas (com a senha real).
   - `ADMIN_PASSWORD` → defina a senha inicial do admin.
   (O `JWT_SECRET` é gerado sozinho.)
4. **Apply / Create** → aguarde o build. No fim você recebe uma URL tipo
   `https://laundrflow-server.onrender.com`.

### Opção B — Manual (sem blueprint)
1. **New +** → **Web Service** → conecte o repositório.
2. Configure:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
3. Em **Environment**, adicione as variáveis (as mesmas do `.env.example`):
   `MONGODB_URI`, `DB_NAME=laundrflow`, `JWT_SECRET` (invente um valor longo), `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=<sua senha>`.
4. **Create Web Service** → aguarde o deploy.

## Parte 4 — Testar

1. Abra `https://SUA-URL.onrender.com/health` no navegador → deve responder `{"ok":true,...}`.
   (Na primeira vez pode demorar ~40s se estiver dormindo.)
2. Nos **Logs** do Render, confirme a linha do admin criado no primeiro boot.

## Parte 5 — Ligar o app à API

1. Abra o app → tela de login → **Configurar servidor**.
2. Cole a URL do Render (ex.: `https://laundrflow-server.onrender.com`) → **Salvar**.
3. Entre com `admin` e a senha que você definiu.
4. Vá em **Usuários & Cargos** e crie os cargos e usuários da sua equipe.
5. **Troque a senha do admin** logo após o primeiro acesso.

Todos os apps instalados nas máquinas da equipe usam essa **mesma URL**. Pronto.

---

## Alternativa: Fly.io (grátis e não dorme)

Se o "dormir" do Render te incomodar:
1. Instale o CLI: https://fly.io/docs/hands-on/install-flyctl/
2. Na pasta `server/`:
   ```bash
   fly launch        # detecta Node; escolha região próxima; NÃO faça deploy ainda
   fly secrets set MONGODB_URI="mongodb+srv://..." JWT_SECRET="algo-longo" ADMIN_USERNAME="admin" ADMIN_PASSWORD="sua-senha" DB_NAME="laundrflow"
   fly deploy
   ```
3. A URL será algo como `https://seu-app.fly.dev`. Use-a no app.
