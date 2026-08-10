// Dados do app (esquemas, transações, conversões) — protegidos por login.
// O estado é guardado como UM documento (_id: "laundrflow_state"), igual ao modelo do app.
import { Router } from "express";
import { collections } from "../db.js";
import { requireAuth, requireEditData } from "../auth.js";

const router = Router();
const STATE_ID = "laundrflow_state";

// GET /state -> devolve o estado atual (qualquer usuário autenticado pode ler)
router.get("/", requireAuth, async (_req, res) => {
  const doc = await collections.state().findOne({ _id: STATE_ID });
  if (!doc) {
    return res.json({ state: { schemes: [], transactions: [], conversions: [] } });
  }
  const { _id, updatedAt, updatedBy, ...state } = doc;
  res.json({ state, updatedAt, updatedBy });
});

// PUT /state  { state } -> substitui o estado (só quem tem permissão de edição)
router.put("/", requireAuth, requireEditData, async (req, res) => {
  const incoming = req.body?.state;
  if (!incoming || typeof incoming !== "object") {
    return res.status(400).json({ error: "Payload de estado inválido." });
  }

  const doc = {
    _id: STATE_ID,
    schemes: Array.isArray(incoming.schemes) ? incoming.schemes : [],
    transactions: Array.isArray(incoming.transactions) ? incoming.transactions : [],
    conversions: Array.isArray(incoming.conversions) ? incoming.conversions : [],
    updatedAt: new Date().toISOString(),
    updatedBy: req.auth.user.username,
  };

  await collections.state().replaceOne({ _id: STATE_ID }, doc, { upsert: true });
  res.json({ ok: true, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy });
});

export default router;
