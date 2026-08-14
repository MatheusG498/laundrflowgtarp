// Definição central de telas (seções) e cargos padrão.

// Chaves das telas do app. Cada cargo escolhe quais o usuário pode ver.
export const SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "schemes", label: "Clientes Ilegais" },
  { key: "legal-schemes", label: "Clientes Legítimos" },
  { key: "transactions", label: "Lançamentos" },
  { key: "monitor", label: "Monitoramento" },
  { key: "ledger", label: "Livro-Razão" },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);

// Cargos criados automaticamente no primeiro boot. O admin pode editar/criar mais depois.
export const DEFAULT_ROLES = [
  {
    name: "Administrador",
    permissions: SECTION_KEYS,
    canEditData: true,
    canConfirm: true, // pode confirmar operações (Check, enviar faltante, concluir)
    isAdmin: true, // pode gerenciar usuários e cargos
    system: true, // cargo protegido: não pode ser apagado
  },
  {
    name: "Gerente",
    permissions: SECTION_KEYS,
    canEditData: true,
    canConfirm: true,
    isAdmin: false,
    system: false,
  },
  {
    name: "Operador",
    permissions: ["dashboard", "transactions", "monitor"],
    canEditData: true,
    canConfirm: false,
    isAdmin: false,
    system: false,
  },
  {
    name: "Visualizador",
    permissions: ["dashboard", "ledger"],
    canEditData: false, // só leitura
    canConfirm: false,
    isAdmin: false,
    system: false,
  },
];

// Normaliza uma lista de permissões, mantendo só chaves válidas.
export function sanitizePermissions(perms) {
  if (!Array.isArray(perms)) return [];
  return perms.filter((p) => SECTION_KEYS.includes(p));
}
