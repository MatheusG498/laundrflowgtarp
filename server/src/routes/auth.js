// Rotas de autenticação: login e "quem sou eu".
import { Router } from "express";
import { collections } from "../db.js";
import { verifyPassword, signToken, requireAuth, publicUser } from "../auth.js";

const router = Router();

// POST /auth/login  { username, password }
router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Informe usuário e senha." });
  }

  const user = await collections.users().findOne({ username: String(username).trim() });
  if (!user || user.active === false) {
    return res.status(401).json({ error: "Usuário ou senha inválidos." });
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return res.status(401).json({ error: "Usuário ou senha inválidos." });
  }

  const role = await collections.roles().findOne({ _id: user.roleId });
  const token = signToken(user);
  res.json({ token, user: publicUser(user, role) });
});

// GET /auth/me  -> dados do usuário logado (revalida cargo/permissões)
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.auth.user, req.auth.role) });
});

export default router;
