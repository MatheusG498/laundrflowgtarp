// Gerenciamento de usuários (somente admin).
import { Router } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../db.js";
import { hashPassword, requireAuth, requireAdmin, publicUser } from "../auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// Junta cada usuário ao seu cargo para exibição.
async function withRole(user) {
  const role = user.roleId
    ? await collections.roles().findOne({ _id: user.roleId })
    : null;
  return publicUser(user, role);
}

// GET /users -> lista todos
router.get("/", async (_req, res) => {
  const users = await collections.users().find().sort({ username: 1 }).toArray();
  res.json({ users: await Promise.all(users.map(withRole)) });
});

// POST /users  { username, password, roleId }
router.post("/", async (req, res) => {
  const { username, password, roleId } = req.body || {};
  if (!username || !password || !roleId) {
    return res.status(400).json({ error: "Informe usuário, senha e cargo." });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: "A senha deve ter ao menos 4 caracteres." });
  }

  let roleOid;
  try {
    roleOid = new ObjectId(roleId);
  } catch (_) {
    return res.status(400).json({ error: "Cargo inválido." });
  }
  const role = await collections.roles().findOne({ _id: roleOid });
  if (!role) return res.status(400).json({ error: "Cargo não encontrado." });

  const uname = String(username).trim();
  const exists = await collections.users().findOne({ username: uname });
  if (exists) return res.status(409).json({ error: "Já existe um usuário com esse nome." });

  const doc = {
    username: uname,
    passwordHash: await hashPassword(String(password)),
    roleId: roleOid,
    active: true,
    createdAt: new Date().toISOString(),
  };
  const result = await collections.users().insertOne(doc);
  res.status(201).json({ user: publicUser({ ...doc, _id: result.insertedId }, role) });
});

// PATCH /users/:id  { roleId?, active?, password? }
router.patch("/:id", async (req, res) => {
  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch (_) {
    return res.status(400).json({ error: "ID inválido." });
  }

  const user = await collections.users().findOne({ _id: oid });
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

  const update = {};
  const { roleId, active, password } = req.body || {};

  if (roleId !== undefined) {
    let roleOid;
    try {
      roleOid = new ObjectId(roleId);
    } catch (_) {
      return res.status(400).json({ error: "Cargo inválido." });
    }
    const role = await collections.roles().findOne({ _id: roleOid });
    if (!role) return res.status(400).json({ error: "Cargo não encontrado." });
    update.roleId = roleOid;
  }

  if (active !== undefined) {
    // Impede o admin de desativar a própria conta e se trancar para fora.
    if (String(user._id) === String(req.auth.user._id) && active === false) {
      return res.status(400).json({ error: "Você não pode desativar a própria conta." });
    }
    update.active = !!active;
  }

  if (password !== undefined) {
    if (String(password).length < 4) {
      return res.status(400).json({ error: "A senha deve ter ao menos 4 caracteres." });
    }
    update.passwordHash = await hashPassword(String(password));
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "Nada para atualizar." });
  }

  await collections.users().updateOne({ _id: oid }, { $set: update });
  const updated = await collections.users().findOne({ _id: oid });
  res.json({ user: await withRole(updated) });
});

// DELETE /users/:id
router.delete("/:id", async (req, res) => {
  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch (_) {
    return res.status(400).json({ error: "ID inválido." });
  }
  if (String(oid) === String(req.auth.user._id)) {
    return res.status(400).json({ error: "Você não pode apagar a própria conta." });
  }
  const result = await collections.users().deleteOne({ _id: oid });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }
  res.json({ ok: true });
});

export default router;
