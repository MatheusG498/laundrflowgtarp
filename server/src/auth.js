// Autenticação: hash de senha (Argon2), tokens JWT e middlewares de proteção.
import jwt from "jsonwebtoken";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { ObjectId } from "mongodb";
import { collections } from "./db.js";

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET ausente ou muito curto. Defina um segredo longo no .env.");
  }
  return s;
}

// ----- Senha -----

export async function hashPassword(plain) {
  return argonHash(plain);
}

export async function verifyPassword(hashStr, plain) {
  try {
    return await argonVerify(hashStr, plain);
  } catch (_) {
    return false;
  }
}

// ----- Token -----

export function signToken(user) {
  const payload = { sub: String(user._id), username: user.username };
  return jwt.sign(payload, jwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// ----- Middlewares -----

// Exige um token válido; carrega o usuário + cargo em req.auth.
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Não autenticado." });

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret());
    } catch (_) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }

    const user = await collections.users().findOne({ _id: new ObjectId(decoded.sub) });
    if (!user || user.active === false) {
      return res.status(401).json({ error: "Usuário inexistente ou desativado." });
    }

    const role = await collections.roles().findOne({ _id: user.roleId });
    req.auth = { user, role: role || null };
    next();
  } catch (err) {
    console.error("[auth] erro:", err);
    res.status(500).json({ error: "Erro interno de autenticação." });
  }
}

// Exige que o cargo do usuário seja administrador.
export function requireAdmin(req, res, next) {
  if (!req.auth?.role?.isAdmin) {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }
  next();
}

// Exige permissão de escrita de dados.
export function requireEditData(req, res, next) {
  if (!req.auth?.role?.canEditData) {
    return res.status(403).json({ error: "Seu cargo não permite editar dados." });
  }
  next();
}

// Monta o objeto público do usuário (sem o hash da senha) para devolver ao app.
export function publicUser(user, role) {
  return {
    id: String(user._id),
    username: user.username,
    active: user.active !== false,
    role: role
      ? {
          id: String(role._id),
          name: role.name,
          permissions: role.permissions || [],
          canEditData: !!role.canEditData,
          isAdmin: !!role.isAdmin,
        }
      : null,
  };
}
