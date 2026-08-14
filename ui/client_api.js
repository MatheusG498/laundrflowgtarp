// ============================================================
// Camada de API do LaundrFlow (cliente).
// Fala com o SERVIDOR CENTRAL (não mais com o Mongo direto):
//   - Login / sessão (JWT)
//   - Cargos e permissões (menu por cargo)
//   - Sincronização dos dados com fila offline
//   - Administração de usuários e cargos (só admin)
// Carregado DEPOIS de app_v1.js.
// ============================================================

(function () {
    "use strict";

    // -------------------- Chaves de armazenamento --------------------
    const API_URL_KEY = "laundrflow_api_url";
    const TOKEN_KEY = "laundrflow_token";
    const USER_KEY = "laundrflow_user";
    const LAST_SYNC_KEY = "laundrflow_last_sync";
    const DIRTY_KEY = "laundrflow_pending_sync";
    const REMEMBER_KEY = "laundrflow_remember";
    const HEARTBEAT_MS = 5000; // auto-sync com o servidor a cada 5s
    const DEFAULT_API = "https://laundrflow-server.onrender.com";

    // -------------------- Estado em memória --------------------
    let currentUser = null;
    let isOnline = false;
    let offlineMode = false;
    let pushTimer = null;
    let heartbeatTimer = null;
    let syncing = false;
    let sectionsCatalog = []; // [{key,label}] vindo do servidor
    let lastAppliedUpdatedAt = null; // último updatedAt do servidor já aplicado localmente

    // Evita aplicar um pull enquanto o usuário está no meio de uma edição
    function isUserBusy() {
        const modalOpen = [...document.querySelectorAll(".modal-overlay, #modal-monitor-details")]
            .some(m => m && getComputedStyle(m).display !== "none");
        const dropdownOpen = !!document.querySelector(".searchable-select-container.open");
        return modalOpen || dropdownOpen;
    }

    // -------------------- Helpers básicos --------------------
    function $(id) { return document.getElementById(id); }

    function getApiUrl() {
        return (localStorage.getItem(API_URL_KEY) || DEFAULT_API).replace(/\/+$/, "");
    }
    function setApiUrl(u) { localStorage.setItem(API_URL_KEY, (u || "").trim()); }

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

    function getCachedUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (_) { return null; }
    }
    function setCachedUser(u) {
        u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY);
    }

    function markDirty() { localStorage.setItem(DIRTY_KEY, "1"); }
    function clearDirty() { localStorage.removeItem(DIRTY_KEY); }
    function isDirty() { return localStorage.getItem(DIRTY_KEY) === "1"; }

    function canEdit() { return !!(currentUser && currentUser.role && currentUser.role.canEditData); }
    function isAdmin() { return !!(currentUser && currentUser.role && currentUser.role.isAdmin); }

    function showStatus(elId, message, kind) {
        const el = $(elId);
        if (!el) return;
        el.style.display = "flex";
        el.className = "settings-status status-" + kind;
        const icon = kind === "success" ? "fa-circle-check" :
                     kind === "error" ? "fa-circle-exclamation" : "fa-spinner fa-spin";
        el.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    }
    function hideStatus(elId) { const el = $(elId); if (el) el.style.display = "none"; }

    function formatTime(iso) {
        if (!iso) return "—";
        try { return new Date(iso).toLocaleString("pt-BR"); } catch (_) { return "—"; }
    }
    function refreshLastSync() {
        const el = $("sync-last-time");
        if (el) el.textContent = formatTime(localStorage.getItem(LAST_SYNC_KEY));
    }
    function markSynced() {
        localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
        refreshLastSync();
    }
    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
        ));
    }

    // -------------------- Cliente HTTP --------------------
    // Lança Error normal em erro de API (com .status) e Error com .network em falha de rede.
    async function api(path, opts = {}) {
        const { method = "GET", body = null, auth = true } = opts;
        const headers = { "Content-Type": "application/json" };
        if (auth) {
            const t = getToken();
            if (t) headers["Authorization"] = "Bearer " + t;
        }
        let res;
        try {
            res = await fetch(getApiUrl() + path, {
                method,
                headers,
                body: body != null ? JSON.stringify(body) : undefined,
            });
        } catch (e) {
            const err = new Error("Sem conexão com o servidor.");
            err.network = true;
            throw err;
        }
        let data = null;
        try { data = await res.json(); } catch (_) {}
        if (!res.ok) {
            const err = new Error((data && data.error) || ("Erro " + res.status));
            err.status = res.status;
            throw err;
        }
        return data;
    }

    // -------------------- Indicadores de rede --------------------
    function setNetworkState(online) {
        isOnline = online;
        const badge = $("sync-badge");
        const badgeText = $("sync-badge-text");
        if (badge && badgeText) {
            badge.classList.remove("online", "offline");
            if (online && !offlineMode) {
                badge.classList.add("online");
                badgeText.textContent = "Online — servidor conectado";
            } else {
                badge.classList.add("offline");
                badgeText.textContent = offlineMode ? "Offline (modo local)" : "Sem conexão";
            }
        }
        const card = $("network-status-card");
        const statusText = $("network-status-text");
        if (card && statusText) {
            if (online && !offlineMode) {
                card.classList.remove("is-offline");
                statusText.textContent = "Servidor Conectado";
            } else {
                card.classList.add("is-offline");
                statusText.textContent = "Offline (local)";
            }
        }
    }

    // -------------------- Estado / dados do app --------------------
    function collectState() {
        return {
            schemes: window.state ? window.state.schemes : [],
            transactions: window.state ? window.state.transactions : [],
            conversions: window.state ? (window.state.conversions || []) : [],
        };
    }

    function applyState(payload) {
        if (!payload || typeof payload !== "object") return;
        if (Array.isArray(payload.schemes)) window.state.schemes = payload.schemes;
        if (Array.isArray(payload.transactions)) window.state.transactions = payload.transactions;
        if (Array.isArray(payload.conversions)) window.state.conversions = payload.conversions;
        if (typeof originalSaveState === "function") originalSaveState();
        ["updateDashboard", "renderSchemes", "renderLegalSchemes", "renderConversions", "renderLedger"]
            .forEach((fn) => { if (typeof window[fn] === "function") { try { window[fn](); } catch (_) {} } });
    }

    const originalSaveState = window.saveState;
    window.saveState = function () {
        if (typeof originalSaveState === "function") originalSaveState();
        if (currentUser && canEdit()) { markDirty(); schedulePush(); }
    };

    function schedulePush() {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => pushStateToServer(true), 1200);
    }

    async function pushStateToServer(silent) {
        if (!currentUser) return { ok: false };
        if (!canEdit()) { if (!silent) showStatus("sync-status", "Seu cargo é somente leitura.", "error"); return { ok: false }; }
        if (syncing) return { ok: false };
        syncing = true;
        if (!silent) showStatus("sync-status", "Enviando dados ao servidor...", "loading");
        try {
            const res = await api("/state", { method: "PUT", body: { state: collectState() } });
            offlineMode = false;
            setNetworkState(true);
            clearDirty();
            markSynced();
            if (res && res.updatedAt) lastAppliedUpdatedAt = res.updatedAt; // não re-aplicar o próprio envio
            if (!silent) showStatus("sync-status", "Dados enviados com sucesso.", "success");
            return { ok: true, res };
        } catch (e) {
            if (e.network) { offlineMode = true; setNetworkState(false); markDirty(); }
            else if (e.status === 401) { return forceReauth(); }
            if (!silent) showStatus("sync-status", e.message, "error");
            return { ok: false };
        } finally {
            syncing = false;
        }
    }

    async function pullStateFromServer(silent) {
        if (!currentUser) return { ok: false };
        if (!silent) showStatus("sync-status", "Puxando dados do servidor...", "loading");
        try {
            const res = await api("/state");
            offlineMode = false;
            setNetworkState(true);
            if (res && res.state) { applyState(res.state); markSynced(); lastAppliedUpdatedAt = res.updatedAt || null; }
            if (!silent) showStatus("sync-status", "Dados carregados do servidor.", "success");
            return { ok: true };
        } catch (e) {
            if (e.network) { offlineMode = true; setNetworkState(false); }
            else if (e.status === 401) { return forceReauth(); }
            if (!silent) showStatus("sync-status", e.message, "error");
            return { ok: false };
        }
    }

    // -------------------- Loop automático (auto-sync a cada 5s) --------------------
    async function syncTick() {
        if (!currentUser || syncing) return;

        // 1) Se há alterações locais pendentes, envia (prioridade — não perder o que fiz).
        if (canEdit() && isDirty()) {
            await pushStateToServer(true);
            return;
        }

        // 2) Sem pendências: puxa o estado e aplica só se outro usuário mudou algo.
        try {
            const res = await api("/state");
            offlineMode = false;
            setNetworkState(true);
            const serverUpdatedAt = res && res.updatedAt;
            if (res && res.state && serverUpdatedAt && serverUpdatedAt !== lastAppliedUpdatedAt) {
                // Não sobrescreve enquanto o usuário está editando (modal/dropdown aberto);
                // aplica na próxima batida quando ele terminar.
                if (!isUserBusy()) {
                    applyState(res.state);
                    lastAppliedUpdatedAt = serverUpdatedAt;
                    markSynced();
                }
            }
        } catch (e) {
            if (e.network) { offlineMode = true; setNetworkState(false); }
            else if (e.status === 401) { forceReauth(); }
        }
    }
    function startAutoSync() {
        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(syncTick, HEARTBEAT_MS);
        window.addEventListener("online", () => syncTick());
        window.addEventListener("offline", () => { offlineMode = true; setNetworkState(false); });
    }

    // -------------------- Permissões / menu por cargo --------------------
    function applyPermissions() {
        const perms = (currentUser && currentUser.role && currentUser.role.permissions) || [];
        const admin = isAdmin();

        // Telas de dados: mostra só as permitidas.
        const dataTargets = ["dashboard", "schemes", "legal-schemes", "transactions", "monitor", "ledger"];
        document.querySelectorAll(".menu-item").forEach((item) => {
            const target = item.getAttribute("data-target");
            if (dataTargets.includes(target)) {
                item.style.display = perms.includes(target) ? "" : "none";
            } else if (target === "admin") {
                item.style.display = admin ? "" : "none";
            } else {
                item.style.display = ""; // "settings" (Servidor) sempre visível
            }
        });

        // Se a tela ativa não é mais permitida, vai para a primeira permitida (ou Servidor).
        const activeItem = document.querySelector(".menu-item.active");
        const activeTarget = activeItem ? activeItem.getAttribute("data-target") : null;
        const allowed = (t) => (dataTargets.includes(t) ? perms.includes(t) : (t === "admin" ? admin : true));
        if (!activeTarget || !allowed(activeTarget)) {
            const first = document.querySelector('.menu-item[style=""], .menu-item:not([style])') ||
                          [...document.querySelectorAll(".menu-item")].find((i) => i.style.display !== "none");
            if (first) first.click();
        }
    }

    function setProfile() {
        const nameEl = $("profile-name");
        const roleEl = $("profile-role");
        const sessEl = $("session-user");
        const uname = currentUser ? currentUser.username : "—";
        const rname = currentUser && currentUser.role ? currentUser.role.name : "—";
        if (nameEl) nameEl.textContent = uname;
        if (roleEl) roleEl.textContent = rname;
        if (sessEl) sessEl.textContent = currentUser ? `${uname} (${rname})` : "—";
    }

    // -------------------- Lembrar usuário e senha --------------------
    // Guardado com leve ofuscação (base64) — NÃO é criptografia; a senha
    // fica recuperável em texto por quem tiver acesso a esta máquina.
    function b64encode(s) { return btoa(unescape(encodeURIComponent(s))); }
    function b64decode(s) { return decodeURIComponent(escape(atob(s))); }

    function saveRemember(username, password) {
        try {
            localStorage.setItem(REMEMBER_KEY, b64encode(JSON.stringify({ u: username, p: password })));
        } catch (_) {}
    }
    function clearRemember() { localStorage.removeItem(REMEMBER_KEY); }
    function getRemember() {
        try {
            const raw = localStorage.getItem(REMEMBER_KEY);
            return raw ? JSON.parse(b64decode(raw)) : null;
        } catch (_) { return null; }
    }

    function prefillRemembered() {
        const rem = getRemember();
        if ($("login-user")) $("login-user").value = rem ? (rem.u || "") : "";
        if ($("login-pass")) $("login-pass").value = rem ? (rem.p || "") : "";
        if ($("login-remember")) $("login-remember").checked = !!rem;
    }

    // -------------------- Login / logout --------------------
    function showLogin(message, kind) {
        const ov = $("login-overlay");
        if (ov) ov.classList.add("visible");
        if (message) showStatus("login-status", message, kind || "error");
        else hideStatus("login-status");
        const apiField = $("login-api-url");
        if (apiField) apiField.value = getApiUrl();
        prefillRemembered();
    }
    function hideLogin() {
        const ov = $("login-overlay");
        if (ov) ov.classList.remove("visible");
    }

    async function doLogin(username, password) {
        showStatus("login-status", "Entrando...", "loading");
        try {
            const res = await api("/auth/login", { method: "POST", auth: false, body: { username, password } });
            setToken(res.token);
            currentUser = res.user;
            setCachedUser(res.user);
            // Lembrar (ou esquecer) as credenciais conforme o checkbox
            const remember = $("login-remember");
            if (remember && remember.checked) saveRemember(username, password);
            else clearRemember();
            await onAuthenticated(false);
            hideStatus("login-status");
        } catch (e) {
            showStatus("login-status", e.network ? "Sem conexão com o servidor. Verifique a URL da API." : e.message, "error");
        }
    }

    function forceReauth() {
        setToken(null);
        currentUser = null;
        offlineMode = false;
        showLogin("Sua sessão expirou. Entre novamente.", "error");
        return { ok: false };
    }

    function logout() {
        setToken(null);
        setCachedUser(null);
        currentUser = null;
        offlineMode = false;
        clearInterval(heartbeatTimer);
        setProfile();
        showLogin();
    }

    async function onAuthenticated(offline) {
        offlineMode = !!offline;
        hideLogin();
        setProfile();
        applyPermissions();
        setNetworkState(!offline);
        refreshLastSync();

        if (!offline) {
            // Se há pendências locais, envia; senão, puxa o mais recente.
            if (canEdit() && isDirty()) await pushStateToServer(true);
            else await pullStateFromServer(true);
        }
        startAutoSync();
    }

    // -------------------- Administração: cargos --------------------
    let rolesCache = [];
    let searchableNewUserRole = null;
    let searchableNewUserOrg = null;
    let editingRoleId = null; // id do cargo sendo editado (null = criando novo)

    // -------------------- Diálogos customizados (funcionam no Tauri, ao contrário de confirm/prompt) --------------------
    function uiDialog(opts) {
        return new Promise((resolve) => {
            const prompt = !!opts.prompt;
            const overlay = document.createElement("div");
            overlay.className = "ui-dialog-overlay";
            const inputHtml = prompt
                ? `<input class="ui-dialog-input" type="${opts.password ? "password" : "text"}" placeholder="${opts.placeholder || ""}" autocomplete="off" spellcheck="false">`
                : "";
            overlay.innerHTML = `
                <div class="ui-dialog glass-panel">
                    <div class="ui-dialog-msg">${opts.message || ""}</div>
                    ${inputHtml}
                    <div class="ui-dialog-actions">
                        <button class="btn btn-secondary ui-dialog-cancel">Cancelar</button>
                        <button class="btn ${opts.danger ? "btn-danger" : "btn-primary"} ui-dialog-ok">${opts.okText || "Confirmar"}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            const input = overlay.querySelector(".ui-dialog-input");
            if (input) setTimeout(() => input.focus(), 50);
            const done = (val) => { overlay.remove(); resolve(val); };
            overlay.querySelector(".ui-dialog-cancel").addEventListener("click", () => done(prompt ? null : false));
            overlay.querySelector(".ui-dialog-ok").addEventListener("click", () => done(prompt ? (input ? input.value : "") : true));
            overlay.addEventListener("click", (e) => { if (e.target === overlay) done(prompt ? null : false); });
            if (input) input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") overlay.querySelector(".ui-dialog-ok").click();
                else if (e.key === "Escape") done(null);
            });
        });
    }
    const uiConfirm = (message, o = {}) => uiDialog({ message, danger: o.danger, okText: o.okText });
    const uiPrompt = (message, o = {}) => uiDialog({ message, prompt: true, password: o.password, placeholder: o.placeholder });

    async function loadRoles() {
        try {
            const res = await api("/roles");
            rolesCache = res.roles || [];
            sectionsCatalog = res.sections || [];
            renderRolePermCheckboxes();
            renderRoleUserSelect();
            renderNewUserOrgSelect();
            renderRolesList();
        } catch (e) {
            if (e.status === 401) return forceReauth();
            showStatus("role-status", e.message, "error");
        }
    }

    function renderRolePermCheckboxes() {
        const box = $("new-role-perms");
        if (!box) return;
        box.innerHTML = sectionsCatalog.map((s) =>
            `<label class="perm-check"><input type="checkbox" value="${s.key}"> ${escapeHtml(s.label)}</label>`
        ).join("");
    }

    function renderRoleUserSelect() {
        const container = $("new-user-role-container");
        if (!container || !window.initSearchableSelect) return;
        const opts = rolesCache.map((r) => ({ value: r.id, label: r.name }));
        const prev = searchableNewUserRole ? searchableNewUserRole.getValue() : "";
        searchableNewUserRole = window.initSearchableSelect(container, opts, {
            inputId: "new-user-role",
            placeholder: "Selecione o cargo...",
            required: false,
            hideSearch: true,
            initialValue: (prev && opts.some((o) => o.value === prev)) ? prev : (opts[0] ? opts[0].value : "")
        });
    }

    // Lista de organizações (derivada dos clientes/esquemas) + "Todos"
    function orgOptions() {
        const set = new Set();
        ((window.state && window.state.schemes) || []).forEach((s) => set.add(s.organization || "Geral"));
        const opts = [{ value: "", label: "Todos (todas as organizações)" }];
        [...set].sort((a, b) => a.localeCompare(b, "pt-BR")).forEach((o) => opts.push({ value: o, label: o }));
        return opts;
    }

    function renderNewUserOrgSelect() {
        const container = $("new-user-org-container");
        if (!container || !window.initSearchableSelect) return;
        searchableNewUserOrg = window.initSearchableSelect(container, orgOptions(), {
            inputId: "new-user-org",
            placeholder: "Todos (todas as organizações)",
            required: false,
            initialValue: ""
        });
    }

    function renderRolesList() {
        const list = $("roles-list");
        if (!list) return;
        list.innerHTML = rolesCache.map((r) => {
            const perms = (r.permissions || []).map((p) => {
                const s = sectionsCatalog.find((x) => x.key === p);
                return s ? s.label : p;
            }).join(", ") || "—";
            const badges = [
                r.isAdmin ? '<span class="mini-badge admin">Admin</span>' : "",
                r.canEditData ? '<span class="mini-badge edit">Edita</span>' : '<span class="mini-badge">Leitura</span>',
                r.canConfirm ? '<span class="mini-badge confirm">Confirma</span>' : "",
                r.system ? '<span class="mini-badge sys">Sistema</span>' : "",
            ].join("");
            const edit = `<button class="mini-btn" data-edit-role="${r.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>`;
            const del = r.system ? "" :
                `<button class="mini-btn danger" data-del-role="${r.id}" title="Apagar"><i class="fa-solid fa-trash"></i></button>`;
            return `<div class="admin-item${editingRoleId === r.id ? ' editing' : ''}">
                <div class="admin-item-main">
                    <strong>${escapeHtml(r.name)}</strong> ${badges}
                    <div class="admin-item-sub">Telas: ${escapeHtml(perms)}</div>
                </div>
                <div class="admin-item-actions">${edit}${del}</div>
            </div>`;
        }).join("") || '<div class="admin-empty">Nenhum cargo.</div>';

        list.querySelectorAll("[data-edit-role]").forEach((btn) => {
            btn.addEventListener("click", () => startEditRole(btn.getAttribute("data-edit-role")));
        });
        list.querySelectorAll("[data-del-role]").forEach((btn) => {
            btn.addEventListener("click", () => deleteRole(btn.getAttribute("data-del-role")));
        });
    }

    // Coloca o formulário de cargo em modo de edição, preenchido com o cargo escolhido
    function startEditRole(id) {
        const role = rolesCache.find((r) => r.id === id);
        if (!role) return;
        editingRoleId = id;
        if ($("new-role-name")) $("new-role-name").value = role.name || "";
        document.querySelectorAll("#new-role-perms input[type=checkbox]").forEach((c) => {
            c.checked = (role.permissions || []).includes(c.value);
        });
        if ($("new-role-edit")) $("new-role-edit").checked = !!role.canEditData;
        if ($("new-role-confirm")) $("new-role-confirm").checked = !!role.canConfirm;
        if ($("new-role-admin")) $("new-role-admin").checked = !!role.isAdmin;
        const btn = $("btn-add-role");
        if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Alterações';
        const cancel = $("btn-cancel-role");
        if (cancel) cancel.style.display = "inline-flex";
        showStatus("role-status", `Editando o cargo "${role.name}".`, "loading");
        renderRolesList();
        if ($("new-role-name")) $("new-role-name").scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function cancelEditRole() {
        editingRoleId = null;
        if ($("new-role-name")) $("new-role-name").value = "";
        document.querySelectorAll("#new-role-perms input:checked").forEach((c) => (c.checked = false));
        if ($("new-role-edit")) $("new-role-edit").checked = false;
        if ($("new-role-confirm")) $("new-role-confirm").checked = false;
        if ($("new-role-admin")) $("new-role-admin").checked = false;
        const btn = $("btn-add-role");
        if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> Criar Cargo';
        const cancel = $("btn-cancel-role");
        if (cancel) cancel.style.display = "none";
        hideStatus("role-status");
        renderRolesList();
    }

    async function saveRole() {
        const name = ($("new-role-name") && $("new-role-name").value || "").trim();
        if (!name) return showStatus("role-status", "Informe o nome do cargo.", "error");
        const permissions = [...document.querySelectorAll("#new-role-perms input:checked")].map((c) => c.value);
        const canEditData = !!($("new-role-edit") && $("new-role-edit").checked);
        const canConfirm = !!($("new-role-confirm") && $("new-role-confirm").checked);
        const adminFlag = !!($("new-role-admin") && $("new-role-admin").checked);
        const body = { name, permissions, canEditData, canConfirm, isAdmin: adminFlag };
        try {
            if (editingRoleId) {
                await api("/roles/" + editingRoleId, { method: "PATCH", body });
                showStatus("role-status", "Cargo atualizado.", "success");
            } else {
                await api("/roles", { method: "POST", body });
                showStatus("role-status", "Cargo criado.", "success");
            }
            editingRoleId = null;
            if ($("new-role-name")) $("new-role-name").value = "";
            document.querySelectorAll("#new-role-perms input:checked").forEach((c) => (c.checked = false));
            if ($("new-role-edit")) $("new-role-edit").checked = false;
            if ($("new-role-confirm")) $("new-role-confirm").checked = false;
            if ($("new-role-admin")) $("new-role-admin").checked = false;
            const btn = $("btn-add-role");
            if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> Criar Cargo';
            const cancel = $("btn-cancel-role");
            if (cancel) cancel.style.display = "none";
            await loadRoles();
        } catch (e) {
            if (e.status === 401) return forceReauth();
            showStatus("role-status", e.message, "error");
        }
    }

    async function deleteRole(id) {
        if (!(await uiConfirm("Apagar este cargo?", { danger: true, okText: "Apagar" }))) return;
        try {
            await api("/roles/" + id, { method: "DELETE" });
            await loadRoles();
        } catch (e) {
            if (e.status === 401) return forceReauth();
            showStatus("role-status", e.message, "error");
        }
    }

    // -------------------- Administração: usuários --------------------
    async function loadUsers() {
        try {
            const res = await api("/users");
            renderUsersList(res.users || []);
        } catch (e) {
            if (e.status === 401) return forceReauth();
            showStatus("user-status", e.message, "error");
        }
    }

    function renderUsersList(users) {
        const list = $("users-list");
        if (!list) return;
        list.innerHTML = users.map((u) => {
            const isMe = currentUser && currentUser.id === u.id;
            return `<div class="admin-item">
                <div class="admin-item-main">
                    <strong>${escapeHtml(u.username)}</strong>
                    ${u.active ? "" : '<span class="mini-badge">Inativo</span>'}
                    ${isMe ? '<span class="mini-badge">você</span>' : ""}
                    <div class="admin-item-sub admin-role-row">
                        <span class="admin-role-label">Cargo:</span>
                        <div class="searchable-select-container mini-searchable" id="urole-container-${u.id}"></div>
                    </div>
                    <div class="admin-item-sub admin-role-row">
                        <span class="admin-role-label">Org.:</span>
                        <div class="searchable-select-container mini-searchable" id="uorg-container-${u.id}"></div>
                    </div>
                </div>
                <div class="admin-item-actions">
                    <button class="mini-btn" data-user-pass="${u.id}" title="Redefinir senha"><i class="fa-solid fa-key"></i></button>
                    <button class="mini-btn" data-user-toggle="${u.id}" data-active="${u.active}" title="${u.active ? "Desativar" : "Ativar"}"><i class="fa-solid fa-power-off"></i></button>
                    ${isMe ? "" : `<button class="mini-btn danger" data-user-del="${u.id}" title="Apagar"><i class="fa-solid fa-trash"></i></button>`}
                </div>
            </div>`;
        }).join("") || '<div class="admin-empty">Nenhum usuário.</div>';

        users.forEach((u) => {
            if (!window.initSearchableSelect) return;
            window.initSearchableSelect(`urole-container-${u.id}`, rolesCache.map((r) => ({ value: r.id, label: r.name })), {
                inputId: `urole-${u.id}`,
                required: false,
                hideSearch: true,
                initialValue: u.role ? u.role.id : "",
                onSelect: (val) => patchUser(u.id, { roleId: val })
            });
            window.initSearchableSelect(`uorg-container-${u.id}`, orgOptions(), {
                inputId: `uorg-${u.id}`,
                required: false,
                hideSearch: true,
                initialValue: u.organization || "",
                onSelect: (val) => patchUser(u.id, { organization: val })
            });
        });
        list.querySelectorAll("[data-user-toggle]").forEach((btn) => {
            btn.addEventListener("click", () => patchUser(btn.getAttribute("data-user-toggle"), { active: btn.getAttribute("data-active") !== "true" }));
        });
        list.querySelectorAll("[data-user-pass]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const np = await uiPrompt("Nova senha (mín. 4 caracteres):", { password: true, placeholder: "nova senha" });
                if (np) patchUser(btn.getAttribute("data-user-pass"), { password: np });
            });
        });
        list.querySelectorAll("[data-user-del]").forEach((btn) => {
            btn.addEventListener("click", () => deleteUser(btn.getAttribute("data-user-del")));
        });
    }

    async function addUser() {
        const username = ($("new-user-name") && $("new-user-name").value || "").trim();
        const password = ($("new-user-pass") && $("new-user-pass").value || "");
        const roleId = ($("new-user-role") && $("new-user-role").value) || "";
        const organization = searchableNewUserOrg ? searchableNewUserOrg.getValue() : "";
        if (!username || !password || !roleId) return showStatus("user-status", "Preencha usuário, senha e cargo.", "error");
        try {
            await api("/users", { method: "POST", body: { username, password, roleId, organization } });
            showStatus("user-status", "Usuário criado.", "success");
            if ($("new-user-name")) $("new-user-name").value = "";
            if ($("new-user-pass")) $("new-user-pass").value = "";
            await loadUsers();
        } catch (e) {
            if (e.status === 401) return forceReauth();
            showStatus("user-status", e.message, "error");
        }
    }

    async function patchUser(id, patch) {
        try {
            await api("/users/" + id, { method: "PATCH", body: patch });
            await loadUsers();
        } catch (e) {
            if (e.status === 401) return forceReauth();
            showStatus("user-status", e.message, "error");
            await loadUsers();
        }
    }

    async function deleteUser(id) {
        if (!(await uiConfirm("Apagar este usuário?", { danger: true, okText: "Apagar" }))) return;
        try {
            await api("/users/" + id, { method: "DELETE" });
            await loadUsers();
        } catch (e) {
            if (e.status === 401) return forceReauth();
            showStatus("user-status", e.message, "error");
        }
    }

    async function renderAdmin() {
        if (!isAdmin()) return;
        await loadRoles();
        await loadUsers();
    }

    // -------------------- Config do servidor (URL) --------------------
    async function testApi(fieldId, statusId) {
        const url = ($(fieldId) && $(fieldId).value || "").trim();
        if (url) setApiUrl(url);
        showStatus(statusId, "Testando servidor...", "loading");
        try {
            const res = await fetch(getApiUrl() + "/health");
            const data = await res.json().catch(() => null);
            if (res.ok && data && data.ok) showStatus(statusId, "Servidor acessível ✔", "success");
            else showStatus(statusId, "Respondeu, mas sem /health esperado.", "error");
        } catch (_) {
            showStatus(statusId, "Não foi possível alcançar o servidor.", "error");
        }
    }
    function saveApi(fieldId, statusId) {
        const url = ($(fieldId) && $(fieldId).value || "").trim();
        setApiUrl(url);
        showStatus(statusId, "URL salva.", "success");
    }

    // -------------------- Wiring --------------------
    function wireUI() {
        // Login
        const loginForm = $("login-form");
        if (loginForm) loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            doLogin(($("login-user").value || "").trim(), $("login-pass").value || "");
        });
        const cfgToggle = $("login-config-toggle");
        if (cfgToggle) cfgToggle.addEventListener("click", () => {
            const c = $("login-config");
            if (c) c.style.display = c.style.display === "none" ? "block" : "none";
        });
        if ($("login-test-api")) $("login-test-api").addEventListener("click", () => testApi("login-api-url", "login-status"));
        if ($("login-save-api")) $("login-save-api").addEventListener("click", () => saveApi("login-api-url", "login-status"));

        // Servidor (settings)
        if ($("btn-test-api")) $("btn-test-api").addEventListener("click", () => testApi("api-url", "api-status"));
        if ($("btn-save-api")) $("btn-save-api").addEventListener("click", () => saveApi("api-url", "api-status"));
        if ($("btn-pull-db")) $("btn-pull-db").addEventListener("click", async () => {
            if (await uiConfirm("Isso substitui os dados locais pelos do servidor. Continuar?", { okText: "Puxar" })) pullStateFromServer(false);
        });
        if ($("btn-push-db")) $("btn-push-db").addEventListener("click", () => pushStateToServer(false));
        if ($("btn-logout")) $("btn-logout").addEventListener("click", logout);
        if ($("btn-logout-top")) $("btn-logout-top").addEventListener("click", logout);

        // Admin
        if ($("btn-add-user")) $("btn-add-user").addEventListener("click", addUser);
        if ($("btn-add-role")) $("btn-add-role").addEventListener("click", saveRole);
        if ($("btn-cancel-role")) $("btn-cancel-role").addEventListener("click", cancelEditRole);

        // Ao abrir a aba admin, carrega os dados.
        const adminItem = document.querySelector('.menu-item[data-target="admin"]');
        if (adminItem) adminItem.addEventListener("click", () => { if (isAdmin()) renderAdmin(); });
    }

    // -------------------- Init --------------------
    document.addEventListener("DOMContentLoaded", async () => {
        wireUI();
        refreshLastSync();

        // Preenche campos de URL.
        if ($("api-url")) $("api-url").value = getApiUrl();
        if ($("login-api-url")) $("login-api-url").value = getApiUrl();

        const token = getToken();
        if (!token) { showLogin(); return; }

        // Tenta validar a sessão contra o servidor.
        try {
            const res = await api("/auth/me");
            currentUser = res.user;
            setCachedUser(res.user);
            await onAuthenticated(false);
        } catch (e) {
            if (e.network) {
                // Sem internet: entra em modo offline se houver usuário em cache.
                const cached = getCachedUser();
                if (cached) { currentUser = cached; await onAuthenticated(true); }
                else showLogin("Sem conexão com o servidor. Configure a URL da API.", "error");
            } else {
                forceReauth();
            }
        }
    });

    // Diálogos customizados reutilizáveis (substituem confirm/prompt, bloqueados no Tauri)
    window.LaundrUI = { confirm: uiConfirm, prompt: uiPrompt };

    // Expõe para debug e para o app (ex.: registrar quem criou uma transação).
    window.LaundrAPI = {
        api, login: doLogin, logout, pushStateToServer, pullStateFromServer, getApiUrl,
        getUsername: () => (currentUser ? currentUser.username : null),
        getUser: () => currentUser
    };
})();
