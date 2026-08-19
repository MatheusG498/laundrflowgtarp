// Gerenciamento de cargos/categorias (somente admin).
import { Router } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { SECTIONS, sanitizePermissions } from "../permissions.js";

const router = Router();
router.use(requireAuth, requireAdmin);

function publicRole(role) {
  return {
    id: String(role._id),
    name: role.name,
    permissions: role.permissions || [],
    canEditData: !!role.canEditData,
    // Cargos antigos (sem o campo) herdam de canEditData para não perder acesso ao estoque
    canEditStock: role.canEditStock === undefined ? !!role.canEditData : !!role.canEditStock,
    canConfirm: !!role.canConfirm,
    isAdmin: !!role.isAdmin,
    system: !!role.system,
  };
}

// GET /roles -> lista cargos + catálogo de seções disponíveis
router.get("/", async (_req, res) => {
  const roles = await collections.roles().find().sort({ name: 1 }).toArray();
  res.json({ roles: roles.map(publicRole), sections: SECTIONS });
});

// POST /roles  { name, permissions[], canEditData, isAdmin }
router.post("/", async (req, res) => {
  const { name, permissions, canEditData, canEditStock, canConfirm, isAdmin } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Informe o nome do cargo." });
  }
  const uname = String(name).trim();
  const exists = await collections.roles().findOne({ name: uname });
  if (exists) return res.status(409).json({ error: "Já existe um cargo com esse nome." });

  const doc = {
    name: uname,
    permissions: sanitizePermissions(permissions),
    canEditData: !!canEditData,
    canEditStock: !!canEditStock,
    canConfirm: !!canConfirm,
    isAdmin: !!isAdmin,
    system: false,
  };
  const result = await collections.roles().insertOne(doc);
  res.status(201).json({ role: publicRole({ ...doc, _id: result.insertedId }) });
});

// PATCH /roles/:id
router.patch("/:id", async (req, res) => {
  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch (_) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const role = await collections.roles().findOne({ _id: oid });
  if (!role) return res.status(404).json({ error: "Cargo não encontrado." });

  const { name, permissions, canEditData, canEditStock, canConfirm, isAdmin } = req.body || {};
  const update = {};
  if (name !== undefined) update.name = String(name).trim();
  if (permissions !== undefined) update.permissions = sanitizePermissions(permissions);
  if (canEditData !== undefined) update.canEditData = !!canEditData;
  if (canEditStock !== undefined) update.canEditStock = !!canEditStock;
  if (canConfirm !== undefined) update.canConfirm = !!canConfirm;

  // Não deixa remover o poder de admin do cargo de sistema (evita ficar sem nenhum admin).
  if (isAdmin !== undefined) {
    if (role.system && isAdmin === false) {
      return res.status(400).json({ error: "O cargo de sistema não pode perder o poder de admin." });
    }
    update.isAdmin = !!isAdmin;
  }

  await collections.roles().updateOne({ _id: oid }, { $set: update });
  const updated = await collections.roles().findOne({ _id: oid });
  res.json({ role: publicRole(updated) });
});

// DELETE /roles/:id
router.delete("/:id", async (req, res) => {
  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch (_) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const role = await collections.roles().findOne({ _id: oid });
  if (!role) return res.status(404).json({ error: "Cargo não encontrado." });
  if (role.system) {
    return res.status(400).json({ error: "Cargo de sistema não pode ser apagado." });
  }

  const inUse = await collections.users().countDocuments({ roleId: oid });
  if (inUse > 0) {
    return res.status(409).json({ error: `Há ${inUse} usuário(s) com esse cargo. Troque-os antes de apagar.` });
  }

  await collections.roles().deleteOne({ _id: oid });
  res.json({ ok: true });
});

export default router;
