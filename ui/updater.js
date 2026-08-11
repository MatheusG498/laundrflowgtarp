// ============================================================
// Atualização automática via GitHub Releases (Tauri updater)
// Mostra um aviso no estilo do app com as novidades, instala em
// segundo plano (silencioso/passive) e reabre o app.
// ============================================================

(function () {
    "use strict";

    // Só roda dentro do app Tauri (no navegador não existe updater)
    const TAURI = window.__TAURI__;
    const updater = TAURI && TAURI.updater;
    const proc = TAURI && TAURI.process;

    function $(id) { return document.getElementById(id); }

    let currentManifest = null;
    let updating = false;

    function showStatus(message, kind) {
        const el = $("update-status");
        if (!el) return;
        el.style.display = "flex";
        el.className = "update-status status-" + (kind || "loading");
        const icon = kind === "error" ? "fa-circle-exclamation"
            : kind === "success" ? "fa-circle-check" : "fa-spinner fa-spin";
        el.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    }

    // Formata as notas (changelog) do release em linhas legíveis
    function renderNotes(body) {
        const el = $("update-notes");
        if (!el) return;
        const text = (body || "").trim() || "Melhorias e correções.";
        // Cada linha vira um item; "- " ou "* " viram bullets
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
        el.innerHTML = lines.map(l => {
            const clean = l.replace(/^\s*[-*]\s+/, "");
            const isBullet = /^\s*[-*]\s+/.test(l);
            const safe = clean.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
            return isBullet
                ? `<div class="update-note-item"><i class="fa-solid fa-circle-check"></i><span>${safe}</span></div>`
                : `<div class="update-note-text">${safe}</div>`;
        }).join("");
    }

    function showModal(manifest) {
        currentManifest = manifest;
        const ov = $("update-overlay");
        if (!ov) return;
        if ($("update-version")) $("update-version").textContent = "Versão " + (manifest.version || "");
        renderNotes(manifest.body);
        const st = $("update-status"); if (st) st.style.display = "none";
        ov.classList.add("visible");
    }

    function hideModal() {
        const ov = $("update-overlay");
        if (ov) ov.classList.remove("visible");
    }

    async function checkForUpdates() {
        if (!updater || !updater.checkUpdate) return; // fora do app Tauri
        try {
            const res = await updater.checkUpdate();
            if (res && res.shouldUpdate && res.manifest) {
                showModal(res.manifest);
            }
        } catch (e) {
            // Falha silenciosa (ex.: sem internet) — não incomoda o usuário
            console.warn("[updater] verificação falhou:", e);
        }
    }

    async function installNow() {
        if (updating || !updater || !updater.installUpdate) return;
        updating = true;

        // Trava os botões e mostra progresso
        const btnNow = $("update-now");
        const btnLater = $("update-later");
        if (btnNow) btnNow.disabled = true;
        if (btnLater) btnLater.disabled = true;

        let unlisten = null;
        try {
            // Acompanha o status do download/instalação
            if (updater.onUpdaterEvent) {
                unlisten = await updater.onUpdaterEvent(({ status, error }) => {
                    if (error) { showStatus("Erro: " + error, "error"); return; }
                    if (status === "PENDING") showStatus("Baixando atualização...", "loading");
                    else if (status === "DONE") showStatus("Instalado! Reiniciando...", "success");
                });
            }

            showStatus("Baixando atualização...", "loading");
            await updater.installUpdate(); // baixa + instala (modo passive no Windows)
            showStatus("Instalado! Reiniciando...", "success");

            // Reabre o app já atualizado
            if (proc && proc.relaunch) {
                setTimeout(() => { proc.relaunch(); }, 900);
            }
        } catch (e) {
            showStatus("Falha ao atualizar: " + (e && e.message ? e.message : e), "error");
            if (btnNow) btnNow.disabled = false;
            if (btnLater) btnLater.disabled = false;
            updating = false;
        } finally {
            if (unlisten) { try { unlisten(); } catch (_) {} }
        }
    }

    // Wiring
    document.addEventListener("DOMContentLoaded", () => {
        const btnNow = $("update-now");
        const btnLater = $("update-later");
        if (btnNow) btnNow.addEventListener("click", installNow);
        if (btnLater) btnLater.addEventListener("click", hideModal);

        // Verifica atualizações alguns segundos após abrir (deixa o app carregar)
        if (updater) {
            setTimeout(checkForUpdates, 4000);
        }
    });

    // Exposto para checagem manual (ex.: um botão "Buscar atualizações")
    window.LaundrUpdater = { check: checkForUpdates };
})();
