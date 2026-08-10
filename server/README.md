# LaundrFlow — Servidor API

Servidor central que autentica usuários, aplica cargos/permissões e guarda os dados no MongoDB Atlas.
O app desktop (Tauri) conversa **somente** com este servidor — nunca direto com o banco.

```
[App em cada PC] ──HTTPS──▶ [ESTE SERVIDOR] ──▶ [MongoDB Atlas]
   (só a URL da API)          (guarda a senha       (banco de dados)
                               do Atlas + valida
                               login e cargos)
```

## Requisitos

- Node.js 18 ou superior
- Uma conta/cluster no MongoDB Atlas

## Configuração

1. Copie `.env.example` para `.env` e preencha:
   - `MONGODB_URI` — connection string do Atlas (Connect → Drivers), com a senha real.
   - `DB_NAME` — nome do banco (ex.: `laundrflow`).
   - `JWT_SECRET` — um segredo longo e aleatório.
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin criado no primeiro boot.

2. No Atlas → **Network Access**, libere o acesso do servidor:
   - Em PaaS (Railway/Render/Fly), o IP é dinâmico → adicione `0.0.0.0/0` (liberar geral). O acesso continua protegido por usuário/senha do banco + login da API.

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:8080/health` — deve responder `{"ok":true,...}`.
No console aparece o usuário admin criado (e a senha, se você não definiu uma).

## Deploy em PaaS (via Git)

Suba a pasta `server/` num repositório e conecte ao PaaS. Defina as **variáveis de ambiente**
(as mesmas do `.env`) no painel do serviço. O PaaS define `PORT` sozinho.

- **Railway:** New Project → Deploy from repo → adicione as variáveis → deploy. Comando de start automático (`npm start`).
- **Render:** New → Web Service → Build: `npm install` · Start: `npm start` → adicione as variáveis.
- **Fly.io:** `fly launch` (Node detectado) → `fly secrets set MONGODB_URI=... JWT_SECRET=...` → `fly deploy`.

Ao final você terá uma URL pública (ex.: `https://laundrflow.up.railway.app`). É essa URL que
você vai colar no app, na aba **Servidor**.

## Endpoints principais

| Método | Rota           | Acesso        | O que faz                              |
|--------|----------------|---------------|----------------------------------------|
| GET    | `/health`      | público       | Teste de disponibilidade               |
| POST   | `/auth/login`  | público       | Login → devolve token                  |
| GET    | `/auth/me`     | logado        | Dados do usuário logado                |
| GET    | `/users`       | admin         | Lista usuários                         |
| POST   | `/users`       | admin         | Cria usuário                           |
| PATCH  | `/users/:id`   | admin         | Edita cargo/senha/ativa                |
| DELETE | `/users/:id`   | admin         | Remove usuário                         |
| GET    | `/roles`       | admin         | Lista cargos + seções                  |
| POST   | `/roles`       | admin         | Cria cargo                             |
| PATCH  | `/roles/:id`   | admin         | Edita cargo                            |
| DELETE | `/roles/:id`   | admin         | Remove cargo                           |
| GET    | `/state`       | logado        | Lê os dados do app                     |
| PUT    | `/state`       | logado + edição | Substitui os dados do app            |

## Cargos padrão (criados no 1º boot)

- **Administrador** — vê tudo, edita dados, gerencia usuários e cargos. (protegido)
- **Gerente** — vê tudo e edita dados.
- **Operador** — Dashboard, Lançamentos, Monitoramento (edita dados).
- **Visualizador** — Dashboard e Livro-Razão (somente leitura).

O admin pode criar/editar cargos pela interface do app.

## Segurança

- Senhas guardadas com **Argon2** (hash), nunca em texto puro.
- Sessões via **JWT** assinado com `JWT_SECRET`.
- Permissões (quem vê o quê, quem edita, quem administra) são aplicadas **no servidor** —
  não dá para burlar pelo app.
