// Entrypoint do servidor LaundrFlow.
import "dotenv/config";
import express from "express";
import cors from "cors";

import { connectDB, collections } from "./db.js";
import { hashPassword } from "./auth.js";
import { DEFAULT_ROLES } from "./permissions.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import roleRoutes from "./routes/roles.js";
import stateRoutes from "./routes/state.js";

const app = express();

// CORS liberado: o acesso é protegido por token JWT, e o app desktop tem origem variável.
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Saúde (útil para o PaaS e para o app testar a URL).
app.get("/health", (_req, res) => res.json({ ok: true, service: "laundrflow-server" }));

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/roles", roleRoutes);
app.use("/state", stateRoutes);

// 404 padrão
app.use((_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

// Handler de erro genérico
app.use((err, _req, res, _next) => {
  console.error("[erro]", err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

// Cria índices, cargos padrão e o admin inicial (só se ainda não existir nada).
async function bootstrap() {
  await collections.users().createIndex({ username: 1 }, { unique: true });
  await collections.roles().createIndex({ name: 1 }, { unique: true });

  // Cargos padrão
  const roleCount = await collections.roles().countDocuments();
  if (roleCount === 0) {
    await collections.roles().insertMany(DEFAULT_ROLES);
    console.log("[bootstrap] Cargos padrão criados.");
  }

  // Admin inicial
  const userCount = await collections.users().countDocuments();
  if (userCount === 0) {
    const adminRole = await collections.roles().findOne({ isAdmin: true });
    if (!adminRole) {
      console.error("[bootstrap] Nenhum cargo admin encontrado; não foi possível criar o admin.");
      return;
    }
    const username = (process.env.ADMIN_USERNAME || "admin").trim();
    const password = process.env.ADMIN_PASSWORD || "admin1234";
    await collections.users().insertOne({
      username,
      passwordHash: await hashPassword(password),
      roleId: adminRole._id,
      active: true,
      createdAt: new Date().toISOString(),
    });
    console.log("========================================================");
    console.log(`[bootstrap] Admin inicial criado -> usuário: "${username}"`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log('[bootstrap] SENHA PADRÃO: "admin1234" — TROQUE assim que entrar!');
    }
    console.log("========================================================");
  }
}

const PORT = process.env.PORT || 8080;

connectDB()
  .then(bootstrap)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] LaundrFlow API rodando na porta ${PORT}.`);
    });
  })
  .catch((err) => {
    console.error("[fatal] Falha ao iniciar:", err.message);
    process.exit(1);
  });
