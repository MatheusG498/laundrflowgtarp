// LaundrFlow - Core Logic and State Management

// ----------------------------------------------------
// 1. GERENCIAMENTO DE ESTADO E INICIALIZAÇÃO
// ----------------------------------------------------

let state = {
    schemes: [],
    transactions: [],
    conversions: []
};
// Expõe o estado globalmente para a camada de sincronização (db_sync.js).
window.state = state;

// Confirmação customizada (funciona no Tauri); cai no confirm nativo se indisponível
function appConfirm(message, opts) {
    if (window.LaundrUI && window.LaundrUI.confirm) return window.LaundrUI.confirm(message, opts);
    return Promise.resolve(window.confirm(message));
}

// --- Escopo por organização (o usuário só enxerga a organização vinculada) ---
// Organização do usuário logado (null = "Todos", vê todas)
function getUserOrg() {
    try {
        const u = window.LaundrAPI && window.LaundrAPI.getUser && window.LaundrAPI.getUser();
        return (u && u.organization) ? u.organization : null;
    } catch (_) { return null; }
}
// Permissão de editar/apagar dados
function canEditDataPerm() {
    try {
        const u = window.LaundrAPI && window.LaundrAPI.getUser && window.LaundrAPI.getUser();
        if (!u) return true; // sem contexto de login (standalone)
        return !!(u.role && (u.role.canEditData || u.role.isAdmin));
    } catch (_) { return true; }
}

// Permissão de confirmar operações (Check, enviar faltante, concluir lançamento)
function canConfirmOps() {
    try {
        const u = window.LaundrAPI && window.LaundrAPI.getUser && window.LaundrAPI.getUser();
        if (!u) return true; // sem contexto de login (standalone) — não bloqueia
        return !!(u.role && (u.role.canConfirm || u.role.isAdmin));
    } catch (_) { return true; }
}

// Permissão de administrador (editar/excluir lançamentos e operações já lançados)
function isAdminUser() {
    try {
        const u = window.LaundrAPI && window.LaundrAPI.getUser && window.LaundrAPI.getUser();
        if (!u) return true; // sem contexto de login (standalone) — não bloqueia
        return !!(u.role && u.role.isAdmin);
    } catch (_) { return true; }
}

// Permissão de editar o estoque (produtos/insumos). Admin sempre pode.
function canEditStockPerm() {
    try {
        const u = window.LaundrAPI && window.LaundrAPI.getUser && window.LaundrAPI.getUser();
        if (!u) return true; // sem contexto de login (standalone) — não bloqueia
        return !!(u.role && (u.role.canEditStock || u.role.isAdmin));
    } catch (_) { return true; }
}

// Bloqueia uma ação de edição de dados (lançamentos/operações/clientes) se o cargo não permitir
function requireEditData(msg) {
    if (canEditDataPerm()) return true;
    try { alert(msg || "Seu cargo não tem permissão para editar registros lançados."); } catch (_) {}
    return false;
}

// Bloqueia uma ação de edição de estoque se o cargo não permitir
function requireEditStock(msg) {
    if (canEditStockPerm()) return true;
    try { alert(msg || "Seu cargo não tem permissão para editar o estoque."); } catch (_) {}
    return false;
}

// Esquemas/clientes visíveis para o usuário
function scopedSchemes() {
    const org = getUserOrg();
    if (!org) return state.schemes;
    return state.schemes.filter(s => (s.organization || "Geral") === org);
}
// Transações visíveis (pertencentes aos esquemas da organização)
function scopedTransactions() {
    const org = getUserOrg();
    if (!org) return state.transactions;
    const ids = new Set(scopedSchemes().map(s => s.id));
    return state.transactions.filter(t => ids.has(t.schemeId));
}
// Conversões visíveis (origem OU destino na organização do usuário)
function scopedConversions() {
    const org = getUserOrg();
    const convs = state.conversions || [];
    if (!org) return convs;
    const ids = new Set(scopedSchemes().map(s => s.id));
    return convs.filter(c => ids.has(c.sourceSchemeId) || ids.has(c.destSchemeId));
}

// Filtro de cliente do Dashboard (id do esquema, ou "all" para todos)
let dashboardSchemeFilter = "all";
// Esquemas do Dashboard: escopo da organização, refinado pelo filtro de cliente
function dashSchemes() {
    const base = scopedSchemes();
    return dashboardSchemeFilter === "all" ? base : base.filter(s => s.id === dashboardSchemeFilter);
}
// Transações do Dashboard: escopo da organização, refinado pelo filtro de cliente
function dashTransactions() {
    const base = scopedTransactions();
    return dashboardSchemeFilter === "all" ? base : base.filter(t => t.schemeId === dashboardSchemeFilter);
}

// Usuário logado que está criando a transação (trilha de auditoria)
function currentTxUser() {
    try {
        return (window.LaundrAPI && window.LaundrAPI.getUsername && window.LaundrAPI.getUsername()) || "Sistema";
    } catch (_) {
        return "Sistema";
    }
}

// Dados padrão caso o app seja aberto pela primeira vez
const defaultSchemes = [
    {
        id: "sch-bennys",
        type: "fachada",
        organization: "Benny's Works",
        name: "Benny's Original Motor Works",
        tax: 12.0,
        limit: 1000000,
        category: "Oficina Mecânica (Fachada)",
        hasStock: true,
        items: [
            // Insumos básicos (19 itens)
            { id: "ins-1", name: "Cabeçote", qty: 150, type: "insumo" },
            { id: "ins-2", name: "Bloco de Motor", qty: 150, type: "insumo" },
            { id: "ins-3", name: "Filtros de Motor", qty: 150, type: "insumo" },
            { id: "ins-4", name: "Kit Juntas e Parafusos", qty: 250, type: "insumo" },
            { id: "ins-5", name: "Óleo de Motor", qty: 350, type: "insumo" },
            { id: "ins-6", name: "Pistões", qty: 350, type: "insumo" },
            { id: "ins-7", name: "Kit de Embreagem", qty: 150, type: "insumo" },
            { id: "ins-8", name: "Engrenagens", qty: 250, type: "insumo" },
            { id: "ins-9", name: "Molas", qty: 150, type: "insumo" },
            { id: "ins-10", name: "Braços de Suspensão", qty: 250, type: "insumo" },
            { id: "ins-11", name: "Amortecedores", qty: 150, type: "insumo" },
            { id: "ins-12", name: "Placa Blindada", qty: 250, type: "insumo" },
            { id: "ins-13", name: "Vidro Blindado", qty: 150, type: "insumo" },
            { id: "ins-14", name: "Turbina", qty: 150, type: "insumo" },
            { id: "ins-15", name: "Tubulação motor", qty: 250, type: "insumo" },
            { id: "ins-16", name: "Atuador do Turbo", qty: 150, type: "insumo" },
            { id: "ins-17", name: "Fluido de Freio", qty: 150, type: "insumo" },
            { id: "ins-18", name: "Discos de Freio", qty: 250, type: "insumo" },
            { id: "ins-19", name: "Pastilhas de Freio", qty: 350, type: "insumo" },

            // Produtos (Motores)
            { id: "prod-motor-d", name: "Motor D", qty: 0, type: "produto", value: 6720, recipe: { "ins-1": 1, "ins-2": 1, "ins-3": 1, "ins-4": 1, "ins-5": 4, "ins-6": 4 } },
            { id: "prod-motor-c", name: "Motor C", qty: 0, type: "produto", value: 7720, recipe: { "ins-1": 1, "ins-2": 1, "ins-3": 1, "ins-4": 1, "ins-5": 4, "ins-6": 6 } },
            { id: "prod-motor-b", name: "Motor B", qty: 0, type: "produto", value: 10230, recipe: { "ins-2": 1, "ins-4": 1, "ins-1": 2, "ins-3": 2, "ins-5": 4, "ins-6": 8 } },
            { id: "prod-motor-a", name: "Motor A", qty: 0, type: "produto", value: 11320, recipe: { "ins-2": 1, "ins-1": 2, "ins-3": 2, "ins-4": 2, "ins-5": 5, "ins-6": 10 } },
            { id: "prod-motor-s", name: "Motor S", qty: 0, type: "produto", value: 12450, recipe: { "ins-2": 1, "ins-1": 2, "ins-3": 2, "ins-4": 3, "ins-5": 7, "ins-6": 12 } },

            // Produtos (Transmissões)
            { id: "prod-trans-d", name: "Transmissão D", qty: 0, type: "produto", value: 2450, recipe: { "ins-7": 1, "ins-4": 1, "ins-8": 2 } },
            { id: "prod-trans-c", name: "Transmissão C", qty: 0, type: "produto", value: 3050, recipe: { "ins-7": 1, "ins-4": 1, "ins-8": 4 } },
            { id: "prod-trans-b", name: "Transmissão B", qty: 0, type: "produto", value: 3650, recipe: { "ins-7": 1, "ins-4": 1, "ins-8": 6 } },
            { id: "prod-trans-a", name: "Transmissão A", qty: 0, type: "produto", value: 4300, recipe: { "ins-7": 1, "ins-4": 2, "ins-8": 8 } },
            { id: "prod-trans-s", name: "Transmissão S", qty: 0, type: "produto", value: 4950, recipe: { "ins-7": 1, "ins-4": 3, "ins-8": 10 } },

            // Produtos (Suspensões)
            { id: "prod-susp-d", name: "Suspensão D", qty: 0, type: "produto", value: 290, recipe: { "ins-9": 1, "ins-10": 1, "ins-11": 1 } },
            { id: "prod-susp-c", name: "Suspensão C", qty: 0, type: "produto", value: 1160, recipe: { "ins-9": 4, "ins-10": 4, "ins-11": 4 } },
            { id: "prod-susp-b", name: "Suspensão B", qty: 0, type: "produto", value: 1400, recipe: { "ins-9": 4, "ins-11": 4, "ins-10": 6 } },
            { id: "prod-susp-a", name: "Suspensão A", qty: 0, type: "produto", value: 1640, recipe: { "ins-9": 4, "ins-11": 4, "ins-10": 8 } },
            { id: "prod-susp-s", name: "Suspensão S", qty: 0, type: "produto", value: 1880, recipe: { "ins-9": 4, "ins-11": 4, "ins-10": 10 } },

            // Produtos (Blindagens)
            { id: "prod-blind-d", name: "Blindagem D", qty: 0, type: "produto", value: 450, recipe: { "ins-4": 1, "ins-12": 2 } },
            { id: "prod-blind-c", name: "Blindagem C", qty: 0, type: "produto", value: 850, recipe: { "ins-4": 1, "ins-12": 4 } },
            { id: "prod-blind-b", name: "Blindagem B", qty: 0, type: "produto", value: 4300, recipe: { "ins-4": 2, "ins-13": 2, "ins-12": 6 } },
            { id: "prod-blind-a", name: "Blindagem A", qty: 0, type: "produto", value: 7800, recipe: { "ins-4": 4, "ins-13": 4, "ins-12": 8 } },
            { id: "prod-blind-s", name: "Blindagem S", qty: 0, type: "produto", value: 11250, recipe: { "ins-4": 5, "ins-13": 6, "ins-12": 10 } },

            // Produtos (Turbos)
            { id: "prod-turbo-d", name: "Turbo D", qty: 0, type: "produto", value: 2300, recipe: { "ins-14": 1, "ins-15": 1, "ins-16": 1 } },
            { id: "prod-turbo-c", name: "Turbo C", qty: 0, type: "produto", value: 2300, recipe: { "ins-14": 1, "ins-15": 1, "ins-16": 1 } },
            { id: "prod-turbo-b", name: "Turbo B", qty: 0, type: "produto", value: 2300, recipe: { "ins-14": 1, "ins-15": 1, "ins-16": 1 } },
            { id: "prod-turbo-a", name: "Turbo A", qty: 0, type: "produto", value: 4700, recipe: { "ins-16": 1, "ins-14": 2, "ins-15": 4 } },
            { id: "prod-turbo-s", name: "Turbo S", qty: 0, type: "produto", value: 5800, recipe: { "ins-14": 2, "ins-16": 2, "ins-15": 6 } },

            // Produtos (Freios)
            { id: "prod-freio-d", name: "Freio D", qty: 0, type: "produto", value: 850, recipe: { "ins-17": 1, "ins-18": 2, "ins-19": 4 } },
            { id: "prod-freio-c", name: "Freio C", qty: 0, type: "produto", value: 900, recipe: { "ins-18": 2, "ins-17": 2, "ins-19": 4 } },
            { id: "prod-freio-b", name: "Freio B", qty: 0, type: "produto", value: 950, recipe: { "ins-18": 2, "ins-17": 3, "ins-19": 4 } },
            { id: "prod-freio-a", name: "Freio A", qty: 0, type: "produto", value: 1750, recipe: { "ins-17": 3, "ins-18": 4, "ins-19": 8 } },
            { id: "prod-freio-s", name: "Freio S", qty: 0, type: "produto", value: 1850, recipe: { "ins-18": 4, "ins-17": 5, "ins-19": 8 } }
        ]
    },
    {
        id: "sch-2",
        type: "fachada",
        organization: "Cartel da Fronteira",
        name: "Alpha Consultoria em TI",
        tax: 8.0,
        limit: 350000,
        category: "Serviços Fictícios",
        hasStock: false,
        items: []
    }
];

const defaultTransactions = [
    {
        id: "tx-1",
        schemeId: "sch-bennys",
        amount: 33600,
        date: "2026-08-01",
        type: "Depósito",
        status: "Limpo",
        description: "Aporte de capital - Venda simulada e instalação de 5x Motores D",
        cost: 4032,
        netAmount: 29568,
        stockItemId: "prod-motor-d",
        stockQty: -5,
        hash: "a4f8d2e610b9c375e89d1462faef92837bcde0124a98db87cdfe3948ba290f12"
    },
    {
        id: "tx-2",
        schemeId: "sch-2",
        amount: 120000,
        date: "2026-08-03",
        type: "Estratificação",
        status: "Processando",
        description: "Contrato fictício de assessoria técnica de software",
        cost: 9600,
        netAmount: 110400,
        stockItemId: null,
        stockQty: null,
        hash: "b78c92eef8531aa204f1074a382e9db9a8bc43d1a89b7cf239db84aef012fcd9"
    },
    {
        id: "tx-3",
        schemeId: "sch-bennys",
        amount: 1880,
        date: "2026-08-05",
        type: "Depósito",
        status: "Limpo",
        description: "Venda simulada de 1x kit de Suspensão S Benny's Custom",
        cost: 225.6,
        netAmount: 1654.4,
        stockItemId: "prod-susp-s",
        stockQty: -1,
        hash: "c983a7f85db21049bfe38e12f0eab31827cfdc91a2eb3a84dfbc8291aef0382d"
    }
];

// Carrega o estado do LocalStorage ou define os dados padrão
function loadState() {
    const savedSchemes = localStorage.getItem("laundrflow_schemes");
    const savedTransactions = localStorage.getItem("laundrflow_transactions");
    const savedConversions = localStorage.getItem("laundrflow_conversions");

    if (savedSchemes && savedTransactions) {
        state.schemes = JSON.parse(savedSchemes);
        state.transactions = JSON.parse(savedTransactions);
        state.conversions = savedConversions ? JSON.parse(savedConversions) : [];
        
        // Verifica se a Benny's está presente. Se não estiver, injeta-a como migração
        if (!state.schemes.some(s => s.id === "sch-bennys")) {
            const bennysScheme = defaultSchemes.find(s => s.id === "sch-bennys");
            if (bennysScheme) {
                state.schemes.push(bennysScheme);
                saveState();
            }
        }

        // Garante que todos os esquemas antigos tenham o campo organization e type
        let updated = false;
        state.schemes.forEach(s => {
            if (!s.organization) {
                if (s.id === "sch-bennys") s.organization = "Benny's Works";
                else if (s.id === "sch-2") s.organization = "Cartel da Fronteira";
                else s.organization = "Geral";
                updated = true;
            }
            if (!s.type) {
                s.type = "fachada";
                updated = true;
            }
        });

        // Migração de conversões antigas que não contêm o array de parcelas diárias (days)
        state.conversions.forEach(conv => {
            if (!conv.days || !Array.isArray(conv.days)) {
                const totalDays = conv.durationDays || 1;
                const dailyAmount = parseFloat((conv.amount / totalDays).toFixed(2));
                conv.days = [];
                for (let i = 0; i < totalDays; i++) {
                    const currentDay = new Date(conv.startDate);
                    currentDay.setDate(currentDay.getDate() + i);
                    const currentDayStr = currentDay.toISOString().split('T')[0];

                    conv.days.push({
                        index: i + 1,
                        date: currentDayStr,
                        plannedAmount: dailyAmount,
                        actualAmount: dailyAmount,
                        checked: false,
                        txIds: []
                    });
                }
                updated = true;
            }
        });

        if (updated) {
            saveState();
        }
    } else {
        state.schemes = defaultSchemes;
        state.transactions = defaultTransactions;
        state.conversions = [];
        saveState();
    }
}

// Salva o estado atualizado no LocalStorage
function saveState() {
    localStorage.setItem("laundrflow_schemes", JSON.stringify(state.schemes));
    localStorage.setItem("laundrflow_transactions", JSON.stringify(state.transactions));
    localStorage.setItem("laundrflow_conversions", JSON.stringify(state.conversions || []));
}

// ----------------------------------------------------
// 2. FUNÇÕES DE UTILIDADE E AUXILIARES
// ----------------------------------------------------

window.toggleSchemeTypeFields = function(type, labelId) {
    const labelEl = document.getElementById(labelId);
    if (labelEl) {
        if (type === "legal") {
            labelEl.textContent = "Alíquota de Imposto / Tributação (%)";
        } else {
            labelEl.textContent = "Custo Operacional / Taxa (%)";
        }
    }
    
    // Atualiza dinamicamente as categorias na modal de edição se ela estiver ativa
    const editContainer = document.getElementById("edit-scheme-category-container");
    const editLabel = document.getElementById("edit-scheme-category-label");
    if (editContainer && editLabel) {
        const catOptions = [
            { value: "Serviços Fictícios", label: "Serviços Fictícios (Consultoria/Palestras)" },
            { value: "Comércio de Fachada", label: "Comércio de Fachada (Restaurante/Lavanderia)" },
            { value: "Fracionamento", label: "Fracionamento (Smurfing/Depósitos)" },
            { value: "Aquisição de Ativos", label: "Aquisição de Ativos (Imóveis/Arte)" },
            { value: "Outro", label: "Outro Método Personalizado" }
        ];

        const legalCatOptions = [
            { value: "Serviços Reais", label: "Serviços Legítimos (Desenvolvimento/Consultoria)" },
            { value: "Comércio Legítimo", label: "Comércio Físico (Alimentos/Vestuário)" },
            { value: "Administradora de Ativos", label: "Holding / Administradora de Bens (Imóveis/Títulos)" },
            { value: "Outro", label: "Outra Categoria Comercial" }
        ];

        const activeOptions = (type === "legal") ? legalCatOptions : catOptions;
        editLabel.textContent = (type === "legal") ? "Ramo / Categoria Comercial" : "Método/Categoria de Estratificação";
        
        searchableEditSchemeCategory = initSearchableSelect(editContainer, activeOptions, {
            placeholder: "Selecione a categoria...",
            inputId: "edit-scheme-category",
            initialValue: activeOptions[0].value
        });
    }
};

// Formatação de Moeda
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Máscara monetária em tempo real para inputs de texto
window.maskMoney = function(input) {
    let value = input.value.replace(/\D/g, "");
    if (value === "") {
        input.value = "";
        return;
    }
    let num = parseFloat(value) / 100;
    input.value = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
};

// Faz o parsing de um campo de texto formatado como moeda de volta para float
window.parseMoneyValue = function(elementId) {
    const el = typeof elementId === "string" ? document.getElementById(elementId) : elementId;
    if (!el) return 0;
    const raw = el.value.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(raw);
    return isNaN(num) ? 0 : num;
};

// Define e formata programmaticamente o valor de moeda em um input de texto
window.setMoneyValue = function(elementId, value) {
    const el = typeof elementId === "string" ? document.getElementById(elementId) : elementId;
    if (!el) return;
    if (value === undefined || value === null || isNaN(value)) {
        el.value = "";
        return;
    }
    el.value = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
};

// Cálculo progressivo de imposto com base na tabela progressiva contínua (interpolação suave)
function calculateProgressiveTax(amount) {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return 0;
    
    let tax = 0;
    if (amt <= 50000) {
        // De 0 a 50.000 (cresce de 0% até 3.5%)
        tax = (amt / 50000) * 3.5;
    } else if (amt <= 100000) {
        // De 50.000 a 100.000 (cresce de 3.5% até 7.0%)
        tax = 3.5 + ((amt - 50000) / 50000) * 3.5;
    } else if (amt <= 200000) {
        // De 100.000 a 200.000 (cresce de 7.0% até 14.0%)
        tax = 7.0 + ((amt - 100000) / 100000) * 7.0;
    } else if (amt <= 500000) {
        // De 200.000 a 500.000 (cresce de 14.0% até 21.0%)
        tax = 14.0 + ((amt - 200000) / 300000) * 7.0;
    } else {
        // Acima de 500.000 (cresce de 21.0% até o limite de 27.0% em R$ 999.999.999,00)
        const scale = (amt - 500000) / (999999999 - 500000);
        tax = 21.0 + Math.min(scale, 1.0) * 6.0;
    }
    
    // Retorna a taxa com precisão de 2 casas decimais
    return parseFloat(tax.toFixed(2));
}

// Inicializador de componente Searchable Dropdown dinâmico e reativo
window.initSearchableSelect = function(containerId, options, config = {}) {
    const container = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!container) return null;

    const placeholder = config.placeholder || "Selecione...";
    const required = config.required !== false;
    const inputId = config.inputId || `input-searchable-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const initialValue = config.initialValue || "";
    const onSelect = config.onSelect || null;
    const hideSearch = config.hideSearch === true; // esconde a caixa de busca (listas curtas)

    // Reseta o conteúdo anterior do container
    container.innerHTML = "";
    container.classList.add("searchable-select-container");

    const hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    hiddenInput.id = inputId;
    hiddenInput.className = "stock-item-id"; // Para que a leitura de submit encontre
    if (required) hiddenInput.required = true;
    hiddenInput.value = initialValue;

    const trigger = document.createElement("div");
    trigger.className = "searchable-select-trigger";
    
    // Procura texto inicial correspondente
    let initialText = placeholder;
    if (initialValue) {
        const found = options.find(opt => opt.value === initialValue);
        if (found) initialText = found.label;
    }
    trigger.innerHTML = `<span>${initialText}</span><i class="fa-solid fa-chevron-down"></i>`;

    const dropdown = document.createElement("div");
    dropdown.className = "searchable-select-dropdown hidden";

    let searchWrapper = null;
    let searchInput = null;
    if (!hideSearch) {
        searchWrapper = document.createElement("div");
        searchWrapper.className = "searchable-select-search-wrapper";
        searchWrapper.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><input type="text" class="searchable-select-search" placeholder="Pesquisar...">`;
    }

    const optionsContainer = document.createElement("div");
    optionsContainer.className = "searchable-select-options";

    function populate(filterText = "") {
        optionsContainer.innerHTML = "";
        const filtered = options.filter(opt => 
            opt.label.toLowerCase().includes(filterText.toLowerCase())
        );

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "searchable-option text-muted";
            empty.textContent = "Nenhum resultado encontrado";
            optionsContainer.appendChild(empty);
            return;
        }

        filtered.forEach(opt => {
            const el = document.createElement("div");
            el.className = "searchable-option";
            if (hiddenInput.value === opt.value) {
                el.classList.add("selected");
            }
            el.textContent = opt.label;

            el.addEventListener("click", () => {
                hiddenInput.value = opt.value;
                trigger.querySelector("span").textContent = opt.label;
                dropdown.classList.add("hidden");
                container.classList.remove("open");
                
                // Dispara o callback change se definido
                if (onSelect) onSelect(opt.value, opt.label);
                
                // Dispara evento de change no input hidden para listeners normais do DOM.
                // bubbles:true para que listeners delegados no container-pai também recebam
                // (o input é recriado a cada populate, então listeners diretos ficariam órfãos).
                hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
            });

            optionsContainer.appendChild(el);
        });
    }

    populate();

    if (searchWrapper) {
        searchInput = searchWrapper.querySelector(".searchable-select-search");
        searchInput.addEventListener("input", (e) => {
            populate(e.target.value);
        });
    }

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        
        // Fecha outros abertos
        document.querySelectorAll(".searchable-select-container").forEach(c => {
            if (c !== container) {
                c.classList.remove("open");
                const drop = c.querySelector(".searchable-select-dropdown");
                if (drop) drop.classList.add("hidden");
            }
        });

        const isOpen = container.classList.toggle("open");
        if (isOpen) {
            dropdown.classList.remove("hidden");
            if (searchInput) searchInput.value = "";
            populate();
            if (searchInput) setTimeout(() => searchInput.focus(), 50);
        } else {
            dropdown.classList.add("hidden");
        }
    });

    if (searchWrapper) dropdown.appendChild(searchWrapper);
    dropdown.appendChild(optionsContainer);

    container.appendChild(hiddenInput);
    container.appendChild(trigger);
    container.appendChild(dropdown);

    // Retorna uma API simples para atualizar as opções reativamente
    return {
        updateOptions: (newOptions) => {
            options = newOptions;
            populate();
        },
        setValue: (val) => {
            hiddenInput.value = val;
            const found = options.find(o => o.value === val);
            trigger.querySelector("span").textContent = found ? found.label : placeholder;
            populate();
        },
        getValue: () => hiddenInput.value,
        reset: () => {
            hiddenInput.value = "";
            trigger.querySelector("span").textContent = placeholder;
            populate();
        }
    };
};

// Relógio em Tempo Real
function updateClock() {
    const clockEl = document.getElementById("clock");
    if (clockEl) {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR');
        clockEl.textContent = timeString;
    }
}
setInterval(updateClock, 1000);
updateClock();

// Função Simples para Gerar Hash SHA-256 Fake encadeado (Simulação de Blockchain Ledger)
function generateHash(transactionData, previousHash) {
    const dataString = JSON.stringify(transactionData) + (previousHash || "0000000000000000000000000000000000000000000000000000000000000000");
    
    // Algoritmo simples de hashing de string (djb2 / sdbm adaptado para hex de 64 chars)
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Converte para inteiro de 32 bits
    }
    
    // Cria string hexadecimal de 64 caracteres baseada no hash numérico e nos dados
    let hashHex = Math.abs(hash).toString(16).padEnd(8, 'f');
    let seed = dataString;
    while (hashHex.length < 64) {
        let tempHash = 0;
        for (let j = 0; j < seed.length; j++) {
            tempHash = (tempHash << 7) - tempHash + seed.charCodeAt(j) + hashHex.charCodeAt(hashHex.length - 1);
            tempHash = tempHash & tempHash;
        }
        hashHex += Math.abs(tempHash).toString(16).padEnd(8, 'a');
        seed = hashHex;
    }
    return hashHex.substring(0, 64);
}

// Retorna o último hash da corrente de transações
function getLatestHash() {
    if (state.transactions.length === 0) {
        return "0000000000000000000000000000000000000000000000000000000000000000";
    }
    // Ordena por data e ID e pega o hash do último
    const sorted = [...state.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted[sorted.length - 1].hash;
}

// ----------------------------------------------------
// 3. NAVEGAÇÃO SPA (SINGLE PAGE APPLICATION)
// ----------------------------------------------------

const menuItems = document.querySelectorAll(".menu-item");
const sections = document.querySelectorAll(".app-section");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");

const titlesInfo = {
    dashboard: {
        title: "Painel de Controle",
        subtitle: "Consolidado em tempo real de fluxos e taxas de conversão"
    },
    schemes: {
        title: "Clientes Ilegais (Estruturas de Fachada)",
        subtitle: "Gerencie e acompanhe a eficiência e os limites de cada canal de lavagem"
    },
    "legal-schemes": {
        title: "Clientes Legítimos (Negócios Legais)",
        subtitle: "Gerencie suas empresas e faturamentos legítimos paralelos"
    },
    transactions: {
        title: "Registrar Movimentação",
        subtitle: "Lance novos capitais na rede e selecione a respectiva etapa do fluxo"
    },
    monitor: {
        title: "Monitoramento de Operações",
        subtitle: "Acompanhe o progresso das conversões seguras em andamento"
    },
    ledger: {
        title: "Livro-Razão Imutável",
        subtitle: "Auditoria detalhada com hashes de integridade das transações"
    },
    settings: {
        title: "Servidor",
        subtitle: "Conexão com o servidor central, sessão e sincronização"
    },
    admin: {
        title: "Usuários & Cargos",
        subtitle: "Gerenciamento de contas e permissões (somente administradores)"
    }
};

menuItems.forEach(item => {
    item.addEventListener("click", (e) => {
        e.preventDefault();
        
        // Remove active class de todos
        menuItems.forEach(i => i.classList.remove("active"));
        sections.forEach(s => s.classList.remove("active"));
        
        // Adiciona ao item clicado
        item.classList.add("active");
        
        const targetId = item.getAttribute("data-target");
        const targetSection = document.getElementById(`section-${targetId}`);
        if (targetSection) {
            targetSection.classList.add("active");
        }
        
        // Atualiza textos do Header
        if (titlesInfo[targetId]) {
            pageTitle.textContent = titlesInfo[targetId].title;
            pageSubtitle.textContent = titlesInfo[targetId].subtitle;
        }

        // Renderização específica de cada aba
        if (targetId === 'dashboard') {
            updateDashboard();
        } else if (targetId === 'schemes') {
            renderSchemes();
        } else if (targetId === 'legal-schemes') {
            renderLegalSchemes();
        } else if (targetId === 'transactions') {
            populateSchemeSelect();
        } else if (targetId === 'monitor') {
            renderConversions();
        } else if (targetId === 'ledger') {
            renderLedger();
        }
    });
});

// ----------------------------------------------------
// 4. RENDERS E COMPONENTES DE INTERFACE
// ----------------------------------------------------

// Instâncias Globais dos Gráficos para evitar duplicações
let chartDistributionInstance = null;
let chartTimelineInstance = null;

// Dashboard
function updateDashboard() {
    // Mantém as opções do filtro de cliente atualizadas com os clientes atuais
    if (typeof refreshDashboardSchemeFilter === "function") refreshDashboardSchemeFilter();

    // Dados no escopo da organização do usuário (ou tudo, se "Todos"),
    // refinados pelo filtro de cliente do Dashboard
    const txs = dashTransactions();
    const schemes = dashSchemes();

    // Cálculos
    // Total depositado nos canais de fachada (sujo)
    const totalDeposited = txs
        .filter(t => {
            const s = schemes.find(sc => sc.id === t.schemeId);
            return t.type === "Depósito" && (!s || s.type !== "legal");
        })
        .reduce((sum, t) => sum + t.amount, 0);

    // Total lavado integrado (limpo da fachada)
    const totalIntegrated = txs
        .filter(t => {
            const s = schemes.find(sc => sc.id === t.schemeId);
            return t.type === "Integração" && t.status === "Limpo" && (!s || s.type !== "legal");
        })
        .reduce((sum, t) => sum + t.netAmount, 0);

    // Faturamento líquido dos canais 100% legais
    const totalLegalNet = txs
        .filter(t => {
            const s = schemes.find(sc => sc.id === t.schemeId);
            return s && s.type === "legal";
        })
        .reduce((sum, t) => sum + t.netAmount, 0);

    // Impostos pagos dos canais legais
    const totalLegalTax = txs
        .filter(t => {
            const s = schemes.find(sc => sc.id === t.schemeId);
            return s && s.type === "legal";
        })
        .reduce((sum, t) => sum + t.cost, 0);

    // Custos operacionais gerais (taxas de fachada + impostos legais)
    const totalLosses = txs
        .reduce((sum, t) => sum + t.cost, 0);

    // Taxa de eficiência da lavagem (fachada)
    const efficiencyPct = totalDeposited > 0 
        ? ((totalIntegrated / totalDeposited) * 100).toFixed(1) 
        : "0.0";

    // Índice de Legitimidade (Faturamento Legal / Total Limpo)
    const totalCleanCapital = totalIntegrated + totalLegalNet;
    const legitimacyIndex = totalCleanCapital > 0
        ? ((totalLegalNet / totalCleanCapital) * 100).toFixed(1)
        : "0.0";

    // Atualiza elementos DOM do Dashboard
    document.getElementById("metric-total").textContent = formatCurrency(totalDeposited);
    document.getElementById("metric-integrated").textContent = formatCurrency(totalIntegrated);
    document.getElementById("metric-integrated-pct").textContent = `${efficiencyPct}% do total depositado`;
    
    document.getElementById("metric-legal-total").textContent = formatCurrency(totalLegalNet);
    document.getElementById("metric-legal-tax").textContent = `Tributação paga: ${formatCurrency(totalLegalTax)}`;
    
    document.getElementById("metric-legitimacy-index").textContent = `${legitimacyIndex}%`;
    
    document.getElementById("metric-losses").textContent = formatCurrency(totalLosses);
    
    const avgTax = schemes.length > 0
        ? (schemes.reduce((sum, s) => sum + s.tax, 0) / schemes.length).toFixed(1)
        : "0.0";
    document.getElementById("metric-losses-pct").textContent = `Taxa operacional média: ${avgTax}%`;

    document.getElementById("metric-schemes-count").textContent = schemes.length;

    // Atualiza Gráficos
    renderCharts();
}

// Renderizar os Gráficos
function renderCharts() {
    const ctxDist = document.getElementById("chart-distribution").getContext("2d");
    const ctxTime = document.getElementById("chart-timeline").getContext("2d");

    // Dados no escopo da organização, refinados pelo filtro de cliente do Dashboard
    const txs = dashTransactions();
    const schemes = dashSchemes();

    // Gráfico 1: Distribuição por Canal (Esquema)
    const schemeAmounts = {};
    schemes.forEach(s => {
        schemeAmounts[s.name] = 0;
    });

    txs.forEach(t => {
        const scheme = schemes.find(s => s.id === t.schemeId);
        if (scheme) {
            schemeAmounts[scheme.name] += t.amount;
        }
    });

    const distLabels = Object.keys(schemeAmounts);
    const distData = Object.values(schemeAmounts);

    if (chartDistributionInstance) {
        chartDistributionInstance.destroy();
    }

    chartDistributionInstance = new Chart(ctxDist, {
        type: 'doughnut',
        data: {
            labels: distLabels,
            datasets: [{
                data: distData,
                backgroundColor: [
                    '#00e5ff',
                    '#00ff88',
                    '#ffb300',
                    '#ff3d00',
                    '#9d4edd',
                    '#3a86c8',
                    '#f72585'
                ],
                borderWidth: 1,
                borderColor: '#151821'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#8e92a8',
                        font: { family: 'Plus Jakarta Sans', size: 11 }
                    }
                }
            }
        }
    });

    // Gráfico 2: Evolução de Caixa (Linha do Tempo)
    // Agrupa depósitos vs integrações limpas por data
    const timelineData = {};
    txs.forEach(t => {
        if (!timelineData[t.date]) {
            timelineData[t.date] = { deposited: 0, integrated: 0 };
        }
        if (t.type === "Depósito") {
            timelineData[t.date].deposited += t.amount;
        } else if (t.type === "Integração" && t.status === "Limpo") {
            timelineData[t.date].integrated += t.netAmount;
        }
    });

    // Ordena as datas
    const sortedDates = Object.keys(timelineData).sort((a, b) => new Date(a) - new Date(b));
    const depDataList = [];
    const intDataList = [];
    let accumDep = 0;
    let accumInt = 0;

    sortedDates.forEach(d => {
        accumDep += timelineData[d].deposited;
        accumInt += timelineData[d].integrated;
        depDataList.push(accumDep);
        intDataList.push(accumInt);
    });

    // Formatando datas para exibição curta (dd/mm)
    const formattedLabels = sortedDates.map(dateStr => {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}`;
        }
        return dateStr;
    });

    if (chartTimelineInstance) {
        chartTimelineInstance.destroy();
    }

    chartTimelineInstance = new Chart(ctxTime, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [
                {
                    label: 'Capital Entrada (Total)',
                    data: depDataList,
                    borderColor: '#00e5ff',
                    backgroundColor: 'rgba(0, 229, 255, 0.05)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2
                },
                {
                    label: 'Capital Integrado (Limpo)',
                    data: intDataList,
                    borderColor: '#00ff88',
                    backgroundColor: 'rgba(0, 255, 136, 0.05)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#8e92a8',
                        font: { family: 'Plus Jakarta Sans', size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#8e92a8', font: { family: 'Plus Jakarta Sans', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#8e92a8', font: { family: 'Plus Jakarta Sans', size: 10 } }
                }
            }
        }
    });
}

// Estado dos accordions persistente
window.accordionsState = window.accordionsState || {};

window.toggleAccordion = function(orgId, headerEl, contentEl) {
    const isActive = headerEl.classList.contains("active");
    if (isActive) {
        contentEl.style.maxHeight = contentEl.scrollHeight + "px";
        contentEl.offsetHeight; // Força reflow
        headerEl.classList.remove("active");
        contentEl.classList.remove("active");
        contentEl.style.maxHeight = "0px";
        window.accordionsState[orgId] = false;
    } else {
        headerEl.classList.add("active");
        contentEl.classList.add("active");
        contentEl.style.maxHeight = contentEl.scrollHeight + "px";
        window.accordionsState[orgId] = true;
        
        setTimeout(() => {
            if (contentEl.classList.contains("active")) {
                contentEl.style.maxHeight = "none";
            }
        }, 400);
    }
};

// Renderizar a Lista de Esquemas agrupados por Organização com suporte a Drag & Drop e Accordion
function renderSchemes() {
    const listEl = document.getElementById("schemes-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    // Agrupa os esquemas de fachada por organização
    const groups = {};
    const fachadaSchemes = scopedSchemes().filter(s => s.type !== "legal");
    
    if (fachadaSchemes.length === 0) {
        listEl.innerHTML = `<div class="no-records"><i class="fa-solid fa-user-secret"></i><p>Nenhum cliente ilegal cadastrado.</p></div>`;
        return;
    }

    fachadaSchemes.forEach(scheme => {
        const org = scheme.organization || "Geral";
        if (!groups[org]) groups[org] = [];
        groups[org].push(scheme);
    });

    // Renderiza cada grupo de organização
    for (const org in groups) {
        const orgId = "sch-org-" + org.replace(/\s+/g, '-').toLowerCase();
        
        // Calcula consolidados
        const totalLimit = groups[org].reduce((sum, s) => sum + s.limit, 0);
        const totalProcessed = groups[org].reduce((sum, s) => {
            return sum + state.transactions
                .filter(t => t.schemeId === s.id && t.type === "Depósito")
                .reduce((tSum, t) => tSum + t.amount, 0);
        }, 0);

        const isExpanded = window.accordionsState[orgId] !== false; // Aberto por padrão

        const orgContainer = document.createElement("div");
        orgContainer.className = "org-group-wrapper";
        orgContainer.style.width = "100%";
        orgContainer.style.marginBottom = "20px";

        // Cria o Header Accordion
        const headerEl = document.createElement("div");
        headerEl.className = `org-accordion-header${isExpanded ? ' active' : ''}`;
        headerEl.innerHTML = `
            <div class="org-info-left">
                <i class="fa-solid fa-sitemap" style="color: var(--color-primary); font-size: 15px;"></i>
                <h4>${org.toUpperCase()}</h4>
                <span class="org-count-badge">${groups[org].length} ${groups[org].length === 1 ? 'Negócio' : 'Negócios'}</span>
            </div>
            <div style="display: flex; align-items: center;">
                <div class="org-stats-right">
                    <div class="stat-item">
                        <span class="label">Capacidade Acumulada</span>
                        <span class="value" style="color: var(--text-primary);">${formatCurrency(totalLimit)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Total Processado</span>
                        <span class="value" style="color: var(--color-primary);">${formatCurrency(totalProcessed)}</span>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-down chevron-icon"></i>
            </div>
        `;

        // Cria o Corpo Accordion
        const contentEl = document.createElement("div");
        contentEl.className = `org-accordion-content${isExpanded ? ' active' : ''}`;
        if (isExpanded) {
            contentEl.style.maxHeight = "none";
        }

        // Grid interna
        const gridEl = document.createElement("div");
        gridEl.className = "schemes-grid";
        gridEl.style.display = "grid";
        gridEl.style.gridTemplateColumns = "repeat(auto-fill, minmax(320px, 1fr))";
        gridEl.style.gap = "20px";
        
        gridEl.setAttribute("ondragover", "allowDropScheme(event)");
        gridEl.setAttribute("ondrop", `dropScheme(event, '${org.replace(/'/g, "\\'")}')`);

        groups[org].forEach(scheme => {
            const isLegal = scheme.type === "legal";
            const schemeDeposited = state.transactions
                .filter(t => t.schemeId === scheme.id && (isLegal ? t.type === "Integração" : t.type === "Depósito"))
                .reduce((sum, t) => sum + t.amount, 0);

            const usePercentage = Math.min((schemeDeposited / scheme.limit) * 100, 100);
            
            let progressClass = "";
            let badgeClass = "badge-high";
            let riskLevel = "Alto";

            if (scheme.tax < 8) {
                badgeClass = "badge-critical";
                riskLevel = "Crítico";
            } else if (scheme.tax > 18) {
                badgeClass = "badge-low";
                riskLevel = "Baixo";
            } else {
                badgeClass = "badge-medium";
                riskLevel = "Médio";
            }

            if (isLegal) {
                badgeClass = "badge-legal";
                riskLevel = "Seguro";
            }

            if (usePercentage > 60) progressClass = "warn";
            if (usePercentage > 85) progressClass = "danger";

            const card = document.createElement("div");
            card.className = `scheme-item-card${isLegal ? ' legal-scheme' : ''}`;
            
            card.setAttribute("draggable", "true");
            card.setAttribute("ondragstart", `dragScheme(event, '${scheme.id}')`);
            card.setAttribute("ondragend", "dragEndScheme(event)");

            let stockRowHtml = "";
            if (scheme.hasStock) {
                const totalItems = scheme.items ? scheme.items.reduce((sum, item) => sum + item.qty, 0) : 0;
                stockRowHtml = `
                    <div class="detail-row">
                        <span class="detail-label">Estoque Total:</span>
                        <span class="detail-value text-success" style="font-weight: 700;">${totalItems} un.</span>
                    </div>
                `;
            }

            const taxLabel = isLegal ? "Imposto (Tributação):" : "Custo Operacional:";
            const taxValueColor = isLegal ? "text-success" : "text-warning";
            const categoryIcon = isLegal ? `<i class="fa-solid fa-briefcase" style="color: var(--color-success); font-size: 11px;"></i> ` : '';

            card.innerHTML = `
                <div class="scheme-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <div class="drag-handle" title="Arraste para mover entre organizações" style="margin-top: -2px;">
                            <i class="fa-solid fa-grip-vertical"></i>
                        </div>
                        <div class="scheme-card-title">
                            <h4>${scheme.name}</h4>
                            <span>${categoryIcon}${scheme.category}</span>
                        </div>
                    </div>
                    <span class="scheme-badge ${badgeClass}">${riskLevel}</span>
                </div>
                
                <div class="scheme-card-details">
                    <div class="detail-row">
                        <span class="detail-label">${taxLabel}</span>
                        <span class="detail-value ${taxValueColor}">${scheme.tax.toFixed(1)}%</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Capacidade Limite:</span>
                        <span class="detail-value">${formatCurrency(scheme.limit)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Processado:</span>
                        <span class="detail-value text-primary">${formatCurrency(schemeDeposited)}</span>
                    </div>
                    ${stockRowHtml}
                </div>

                <div class="scheme-progress-container">
                    <div class="scheme-progress-text">
                        <span>Uso da Capacidade</span>
                        <span>${usePercentage.toFixed(1)}%</span>
                    </div>
                    <div class="scheme-progress-bar">
                        <div class="scheme-progress-fill ${progressClass}" style="width: ${usePercentage}%"></div>
                    </div>
                </div>

                <div class="scheme-card-actions" style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    ${scheme.hasStock ? `
                    <button class="btn btn-primary btn-sm-inline" onclick="openStockModal('${scheme.id}', event)" style="padding: 6px 12px;">
                        <i class="fa-solid fa-boxes-stacked"></i> Gerenciar Estoque
                    </button>
                    ` : `<span style="font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-info-circle"></i> Sem Estoque</span>`}
                    
                    <div style="display: flex; gap: 4px; align-items: center;">
                        ${canEditDataPerm() ? `
                        <button class="btn-icon-move" onclick="openMoveOrgModal('${scheme.id}', event)" title="Mover de Organização">
                            <i class="fa-solid fa-right-from-bracket" style="font-size: 14px;"></i>
                        </button>
                        <button class="btn-icon-edit" onclick="openEditSchemeModal('${scheme.id}', event)" title="Editar Esquema">
                            <i class="fa-solid fa-pen-to-square" style="font-size: 14px;"></i>
                        </button>
                        <button class="btn-icon-danger" onclick="deleteScheme('${scheme.id}', event)" title="Excluir Esquema" style="background: none; border: none; color: var(--color-danger); cursor: pointer; padding: 6px;">
                            <i class="fa-solid fa-trash-can" style="font-size: 14px;"></i>
                        </button>
                        ` : `<span style="font-size: 11px; color: var(--text-muted);" title="Somente administradores"><i class="fa-solid fa-lock"></i></span>`}
                    </div>
                </div>
            `;
            gridEl.appendChild(card);
        });

        contentEl.appendChild(gridEl);
        orgContainer.appendChild(headerEl);
        orgContainer.appendChild(contentEl);

        // Click no cabeçalho
        headerEl.addEventListener("click", () => {
            window.toggleAccordion(orgId, headerEl, contentEl);
        });

        // Configura Drag and Drop no cabeçalho com abertura programada em dragenter
        headerEl.setAttribute("ondragover", "allowDropScheme(event)");
        headerEl.setAttribute("ondrop", `dropScheme(event, '${org.replace(/'/g, "\\'")}')`);

        let hoverTimer = null;
        headerEl.addEventListener("dragenter", () => {
            headerEl.classList.add("drag-over");
            // Se o accordion estiver fechado, abre após 600ms de hover
            if (!headerEl.classList.contains("active")) {
                hoverTimer = setTimeout(() => {
                    if (headerEl.classList.contains("drag-over") && !headerEl.classList.contains("active")) {
                        window.toggleAccordion(orgId, headerEl, contentEl);
                    }
                }, 600);
            }
        });

        headerEl.addEventListener("dragleave", () => {
            headerEl.classList.remove("drag-over");
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
        });

        // Configura Drag Over no container
        orgContainer.setAttribute("ondragover", "allowDropScheme(event)");
        orgContainer.setAttribute("ondragenter", "dragEnterOrg(this)");
        orgContainer.setAttribute("ondragleave", "dragLeaveOrg(this)");
        orgContainer.setAttribute("ondrop", `dropScheme(event, '${org.replace(/'/g, "\\'")}')`);

        listEl.appendChild(orgContainer);
    }
}

// Renderizar a Lista de Clientes Legítimos agrupados por Organização com suporte a Drag & Drop e Accordion
function renderLegalSchemes() {
    const listEl = document.getElementById("legal-schemes-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    // Agrupa os esquemas legítimos por organização
    const groups = {};
    const legalSchemes = scopedSchemes().filter(s => s.type === "legal");
    
    if (legalSchemes.length === 0) {
        listEl.innerHTML = `<div class="no-records"><i class="fa-solid fa-briefcase"></i><p>Nenhum cliente legítimo cadastrado.</p></div>`;
        return;
    }

    legalSchemes.forEach(scheme => {
        const org = scheme.organization || "Geral";
        if (!groups[org]) groups[org] = [];
        groups[org].push(scheme);
    });

    // Renderiza cada grupo de organização
    for (const org in groups) {
        const orgId = "legal-org-" + org.replace(/\s+/g, '-').toLowerCase();

        // Calcula consolidados
        const totalLimit = groups[org].reduce((sum, s) => sum + s.limit, 0);
        const totalProcessed = groups[org].reduce((sum, s) => {
            return sum + state.transactions
                .filter(t => t.schemeId === s.id && t.type === "Integração")
                .reduce((tSum, t) => tSum + t.amount, 0);
        }, 0);

        const isExpanded = window.accordionsState[orgId] !== false; // Aberto por padrão

        const orgContainer = document.createElement("div");
        orgContainer.className = "org-group-wrapper";
        orgContainer.style.width = "100%";
        orgContainer.style.marginBottom = "20px";

        // Cabeçalho Accordion
        const headerEl = document.createElement("div");
        headerEl.className = `org-accordion-header${isExpanded ? ' active' : ''}`;
        headerEl.innerHTML = `
            <div class="org-info-left">
                <i class="fa-solid fa-sitemap" style="color: var(--color-primary); font-size: 15px;"></i>
                <h4>${org.toUpperCase()}</h4>
                <span class="org-count-badge">${groups[org].length} ${groups[org].length === 1 ? 'Empresa' : 'Empresas'}</span>
            </div>
            <div style="display: flex; align-items: center;">
                <div class="org-stats-right">
                    <div class="stat-item">
                        <span class="label">Faturamento Limite</span>
                        <span class="value" style="color: var(--text-primary);">${formatCurrency(totalLimit)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Faturamento Consolidado</span>
                        <span class="value" style="color: var(--color-success);">${formatCurrency(totalProcessed)}</span>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-down chevron-icon"></i>
            </div>
        `;

        // Corpo Accordion
        const contentEl = document.createElement("div");
        contentEl.className = `org-accordion-content${isExpanded ? ' active' : ''}`;
        if (isExpanded) {
            contentEl.style.maxHeight = "none";
        }

        const gridEl = document.createElement("div");
        gridEl.className = "schemes-grid";
        gridEl.style.display = "grid";
        gridEl.style.gridTemplateColumns = "repeat(auto-fill, minmax(320px, 1fr))";
        gridEl.style.gap = "20px";
        
        gridEl.setAttribute("ondragover", "allowDropScheme(event)");
        gridEl.setAttribute("ondrop", `dropScheme(event, '${org.replace(/'/g, "\\'")}')`);

        groups[org].forEach(scheme => {
            const schemeDeposited = state.transactions
                .filter(t => t.schemeId === scheme.id && t.type === "Integração")
                .reduce((sum, t) => sum + t.amount, 0);

            const usePercentage = Math.min((schemeDeposited / scheme.limit) * 100, 100);
            
            let progressClass = "";
            let badgeClass = "badge-legal";
            let riskLevel = "Seguro";

            if (usePercentage > 60) progressClass = "warn";
            if (usePercentage > 85) progressClass = "danger";

            const card = document.createElement("div");
            card.className = "scheme-item-card legal-scheme";
            
            card.setAttribute("draggable", "true");
            card.setAttribute("ondragstart", `dragScheme(event, '${scheme.id}')`);
            card.setAttribute("ondragend", "dragEndScheme(event)");

            let stockRowHtml = "";
            if (scheme.hasStock) {
                const totalItems = scheme.items ? scheme.items.reduce((sum, item) => sum + item.qty, 0) : 0;
                stockRowHtml = `
                    <div class="detail-row">
                        <span class="detail-label">Estoque Total:</span>
                        <span class="detail-value text-success" style="font-weight: 700;">${totalItems} un.</span>
                    </div>
                `;
            }

            const taxLabel = "Imposto (Tributação):";
            const taxValueColor = "text-success";
            const categoryIcon = `<i class="fa-solid fa-briefcase" style="color: var(--color-success); font-size: 11px;"></i> `;

            card.innerHTML = `
                <div class="scheme-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <div class="drag-handle" title="Arraste para mover entre organizações" style="margin-top: -2px;">
                            <i class="fa-solid fa-grip-vertical"></i>
                        </div>
                        <div class="scheme-card-title">
                            <h4>${scheme.name}</h4>
                            <span>${categoryIcon}${scheme.category}</span>
                        </div>
                    </div>
                    <span class="scheme-badge ${badgeClass}">${riskLevel}</span>
                </div>
                
                <div class="scheme-card-details">
                    <div class="detail-row">
                        <span class="detail-label">${taxLabel}</span>
                        <span class="detail-value ${taxValueColor}">${scheme.tax.toFixed(1)}%</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Capacidade Limite:</span>
                        <span class="detail-value">${formatCurrency(scheme.limit)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Processado:</span>
                        <span class="detail-value text-primary">${formatCurrency(schemeDeposited)}</span>
                    </div>
                    ${stockRowHtml}
                </div>

                <div class="scheme-progress-container">
                    <div class="scheme-progress-text">
                        <span>Uso da Capacidade</span>
                        <span>${usePercentage.toFixed(1)}%</span>
                    </div>
                    <div class="scheme-progress-bar">
                        <div class="scheme-progress-fill ${progressClass}" style="width: ${usePercentage}%"></div>
                    </div>
                </div>

                <div class="scheme-card-actions" style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    ${scheme.hasStock ? `
                    <button class="btn btn-primary btn-sm-inline" onclick="openStockModal('${scheme.id}', event)" style="padding: 6px 12px;">
                        <i class="fa-solid fa-boxes-stacked"></i> Gerenciar Estoque
                    </button>
                    ` : `<span style="font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-info-circle"></i> Sem Estoque</span>`}
                    
                    <div style="display: flex; gap: 4px; align-items: center;">
                        ${canEditDataPerm() ? `
                        <button class="btn-icon-move" onclick="openMoveOrgModal('${scheme.id}', event)" title="Mover de Organização">
                            <i class="fa-solid fa-right-from-bracket" style="font-size: 14px;"></i>
                        </button>
                        <button class="btn-icon-edit" onclick="openEditSchemeModal('${scheme.id}', event)" title="Editar Esquema">
                            <i class="fa-solid fa-pen-to-square" style="font-size: 14px;"></i>
                        </button>
                        <button class="btn-icon-danger" onclick="deleteScheme('${scheme.id}', event)" title="Excluir Esquema" style="background: none; border: none; color: var(--color-danger); cursor: pointer; padding: 6px;">
                            <i class="fa-solid fa-trash-can" style="font-size: 14px;"></i>
                        </button>
                        ` : `<span style="font-size: 11px; color: var(--text-muted);" title="Somente administradores"><i class="fa-solid fa-lock"></i></span>`}
                    </div>
                </div>
            `;
            gridEl.appendChild(card);
        });

        contentEl.appendChild(gridEl);
        orgContainer.appendChild(headerEl);
        orgContainer.appendChild(contentEl);

        // Click no cabeçalho
        headerEl.addEventListener("click", () => {
            window.toggleAccordion(orgId, headerEl, contentEl);
        });

        // Configura Drag and Drop no cabeçalho com abertura programada em dragenter
        headerEl.setAttribute("ondragover", "allowDropScheme(event)");
        headerEl.setAttribute("ondrop", `dropScheme(event, '${org.replace(/'/g, "\\'")}')`);

        let hoverTimer = null;
        headerEl.addEventListener("dragenter", () => {
            headerEl.classList.add("drag-over");
            // Se o accordion estiver fechado, abre após 600ms de hover
            if (!headerEl.classList.contains("active")) {
                hoverTimer = setTimeout(() => {
                    if (headerEl.classList.contains("drag-over") && !headerEl.classList.contains("active")) {
                        window.toggleAccordion(orgId, headerEl, contentEl);
                    }
                }, 600);
            }
        });

        headerEl.addEventListener("dragleave", () => {
            headerEl.classList.remove("drag-over");
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
        });

        orgContainer.setAttribute("ondragover", "allowDropScheme(event)");
        orgContainer.setAttribute("ondragenter", "dragEnterOrg(this)");
        orgContainer.setAttribute("ondragleave", "dragLeaveOrg(this)");
        orgContainer.setAttribute("ondrop", `dropScheme(event, '${org.replace(/'/g, "\\'")}')`);

        listEl.appendChild(orgContainer);
    }
}

// Variável global para transferir ID do card arrastado de forma segura no WebView2 (file://)
window.draggedSchemeId = null;

// Funções de Drag & Drop para Esquemas e Organizações
window.dragScheme = function(event, schemeId) {
    window.draggedSchemeId = schemeId;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", schemeId);
    }
    event.currentTarget.classList.add("dragging");
};

window.dragEndScheme = function(event) {
    event.currentTarget.classList.remove("dragging");
};

window.allowDropScheme = function(event) {
    event.preventDefault();
};

window.dragEnterOrg = function(element) {
    element.classList.add("drag-over");
};

window.dragLeaveOrg = function(element) {
    element.classList.remove("drag-over");
};

window.dropScheme = function(event, targetOrg) {
    event.preventDefault();
    const schemeId = window.draggedSchemeId || (event.dataTransfer ? event.dataTransfer.getData("text/plain") : null);
    
    // Limpa efeitos visuais de drag-over em todos os elementos possíveis
    document.querySelectorAll(".org-group-wrapper").forEach(g => g.classList.remove("drag-over"));
    document.querySelectorAll(".org-accordion-header").forEach(h => h.classList.remove("drag-over"));
    
    if (schemeId) {
        const scheme = state.schemes.find(s => s.id === schemeId);
        if (scheme && scheme.organization !== targetOrg) {
            scheme.organization = targetOrg;
            saveState();
            renderSchemes();
            renderLegalSchemes();
            populateSchemeSelect();
            populateConversionSelects(); // Atualiza a seleção encadeada da Conversão Segura
        }
    }
    window.draggedSchemeId = null; // limpa após drop
};

// Controle do ID do esquema atualmente aberto na modal de estoque
let currentStockSchemeId = null;

// Abrir modal de estoque do esquema
window.openStockModal = function(schemeId, event) {
    if (event) event.stopPropagation();
    currentStockSchemeId = schemeId;
    const scheme = state.schemes.find(s => s.id === schemeId);
    if (!scheme) return;

    document.getElementById("modal-scheme-name").textContent = scheme.name;
    
    // Abre a modal
    const modal = document.getElementById("modal-manage-stock");
    modal.style.display = "flex";

    // Reseta form de adição
    const formAdd = document.getElementById("form-add-stock-item");
    if (formAdd) formAdd.reset();
    document.getElementById("stock-item-recipe-group").classList.add("hidden");
    document.getElementById("stock-item-qty-group").classList.remove("hidden");

    // Renderiza itens
    renderStockModal();
};

// Fechar modal de estoque
window.closeStockModal = function() {
    const modal = document.getElementById("modal-manage-stock");
    if (modal) modal.style.display = "none";
    currentStockSchemeId = null;
    renderSchemes(); // Atualiza a contagem no card principal
};

// Renderizar itens dentro da modal de estoque
function renderStockModal() {
    if (!currentStockSchemeId) return;
    const scheme = state.schemes.find(s => s.id === currentStockSchemeId);
    if (!scheme) return;

    const tableBody = document.getElementById("modal-stock-table-body");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const items = scheme.items || [];
    
    if (items.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 16px;">Nenhum item cadastrado no estoque.</td></tr>`;
    } else {
        items.forEach(item => {
            // Nome do item como input editável
            const nameInputHtml = `<input type="text" value="${item.name}" onchange="updateItemField('${scheme.id}', '${item.id}', 'name', this.value)" style="background: transparent; border: none; border-bottom: 1px dashed var(--border-color); color: var(--text-primary); font-weight: 700; width: 120px; font-size: 13px; padding: 2px;">`;

            // Tipo do item como select editável
            const typeSelectHtml = `
                <select onchange="updateItemField('${scheme.id}', '${item.id}', 'type', this.value)" style="background: transparent; border: none; color: var(--text-primary); font-size: 12px; cursor: pointer; padding: 2px;">
                    <option value="insumo" ${item.type === 'insumo' ? 'selected' : ''}>Insumo</option>
                    <option value="produto" ${item.type === 'produto' ? 'selected' : ''}>Produto</option>
                </select>
            `;

            // Estoque / Quantidade como input numérico editável
            const qtyInputHtml = `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" value="${item.qty}" min="0" onchange="updateItemField('${scheme.id}', '${item.id}', 'qty', parseInt(this.value) || 0)" style="width: 75px; text-align: center; padding: 2px; border-radius: 4px; background: rgba(0, 0, 0, 0.3); color: var(--text-primary); border: 1px solid var(--border-color); font-size: 12px;">
                    <div style="display: flex; flex-direction: column; gap: 1px;">
                        <button class="btn btn-secondary" onclick="adjustStockItemQty('${scheme.id}', '${item.id}', 1)" style="padding: 1px 4px; font-size: 8px; line-height: 1; border-radius: 2px; height: 12px; display: flex; align-items: center;">+</button>
                        <button class="btn btn-secondary" onclick="adjustStockItemQty('${scheme.id}', '${item.id}', -1)" ${item.qty <= 0 ? 'disabled' : ''} style="padding: 1px 4px; font-size: 8px; line-height: 1; border-radius: 2px; height: 12px; display: flex; align-items: center;">-</button>
                    </div>
                </div>
            `;

            // Fórmula / Ações de Produção
            let formulaOrActions = "";
            if (item.type === "produto") {
                const recipeParts = [];
                const allInsumos = items.filter(i => i.type === "insumo");
                
                // Exibe os insumos que fazem parte da receita e permite alterar a quantidade
                for (const insumoId in item.recipe) {
                    const insumo = items.find(i => i.id === insumoId);
                    const insumoName = insumo ? insumo.name : "Insumo";
                    recipeParts.push(`
                        <div style="display: inline-flex; align-items: center; gap: 2px; margin-right: 8px; margin-bottom: 4px; background: rgba(255,179,0,0.05); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,179,0,0.15);">
                            <input type="number" value="${item.recipe[insumoId]}" min="0" onchange="updateItemRecipeQty('${scheme.id}', '${item.id}', '${insumoId}', parseInt(this.value) || 0)" style="width: 32px; font-size: 10px; padding: 1px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); color: var(--text-primary); text-align: center; border-radius: 3px;">
                            <span style="font-size: 11px; color: var(--color-warning);">${insumoName}</span>
                        </div>
                    `);
                }

                // Seletor para adicionar novos insumos à receita (mais limpo que listar todos)
                const unusedInsumos = allInsumos.filter(ins => item.recipe[ins.id] === undefined);
                let addInsumoSelect = "";
                if (unusedInsumos.length > 0) {
                    addInsumoSelect = `
                        <select onchange="if(this.value){window.updateItemRecipeQty('${scheme.id}','${item.id}',this.value,1);}" style="font-size: 11px; padding: 3px 6px; background: rgba(0,0,0,0.3); border: 1px dashed var(--border-color); color: var(--text-muted); border-radius: 4px; cursor: pointer; margin-top: 2px;">
                            <option value="">+ Adicionar insumo</option>
                            ${unusedInsumos.map(ins => `<option value="${ins.id}">${ins.name}</option>`).join("")}
                        </select>`;
                }

                const activeChips = recipeParts.length > 0 ? recipeParts.join("") : `<span class="text-muted" style="font-size: 11px;">Nenhum insumo na receita ainda.</span>`;
                const recipeHtml = activeChips + addInsumoSelect;

                // Calcula a capacidade de produção baseada em insumos
                let maxProduce = Infinity;
                let hasValidRecipe = false;
                for (const insumoId in item.recipe) {
                    const requiredQty = item.recipe[insumoId];
                    if (requiredQty > 0) {
                        hasValidRecipe = true;
                        const insumo = items.find(i => i.id === insumoId);
                        const availableQty = insumo ? insumo.qty : 0;
                        const possible = Math.floor(availableQty / requiredQty);
                        if (possible < maxProduce) {
                            maxProduce = possible;
                        }
                    }
                }
                if (maxProduce === Infinity || !hasValidRecipe) maxProduce = 0;

                formulaOrActions = `
                    <div style="margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px; color: var(--text-muted);">Preço (R$):</span>
                        <input type="number" value="${item.value || 0}" min="0" onchange="updateItemField('${scheme.id}', '${item.id}', 'value', parseInt(this.value) || 0)" style="width: 65px; padding: 2px 4px; background: rgba(0,0,0,0.3); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; font-size:11px;">
                    </div>
                    <div style="font-size: 11px; margin-bottom: 6px; display: flex; flex-wrap: wrap; gap: 2px;">${recipeHtml}</div>
                    <div class="stock-action-inline" style="border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 4px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 11px; color: var(--text-success);">Disponível para Criar: ${maxProduce}</span>
                        <div style="display: flex; gap: 4px;">
                            <input type="number" id="produce-qty-${item.id}" min="1" max="${maxProduce}" value="1" style="width: 40px; font-size:11px; padding: 2px 4px; background: rgba(0,0,0,0.3); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;">
                            <button class="btn btn-primary btn-sm-inline" onclick="produceProduct('${scheme.id}', '${item.id}')" ${maxProduce === 0 ? 'disabled' : ''} style="padding: 2px 6px; font-size: 10px;">Criar</button>
                        </div>
                    </div>
                `;
            } else {
                formulaOrActions = `<span class="text-muted" style="font-size:11px;">Matéria-prima básica (Não possui receita)</span>`;
            }

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${nameInputHtml}</td>
                <td>${typeSelectHtml}</td>
                <td>${qtyInputHtml}</td>
                <td>
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                        <div style="flex-grow: 1; text-align: left;">${formulaOrActions}</div>
                        <button class="btn-icon-danger" onclick="deleteStockItem('${scheme.id}', '${item.id}')" title="Excluir Item" style="background:none; border:none; color: var(--color-danger); cursor:pointer; padding: 4px; align-self: flex-start;">
                            <i class="fa-solid fa-trash-can" style="font-size: 12px;"></i>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    // Só quem tem "Pode editar estoque" (ou admin) altera o estoque
    if (!canEditStockPerm()) {
        tableBody.querySelectorAll("input, select, button").forEach(el => {
            el.disabled = true;
            el.title = "Seu cargo não tem permissão para editar o estoque";
        });
        const addForm = document.getElementById("form-add-stock-item");
        if (addForm) addForm.querySelectorAll("input, select, button").forEach(el => { el.disabled = true; });
    }
}

// Atualizar campo específico de um item de estoque diretamente
window.updateItemField = function(schemeId, itemId, field, val) {
    if (!requireEditStock("Seu cargo não tem permissão para editar o estoque.")) return;
    const scheme = state.schemes.find(s => s.id === schemeId);
    if (!scheme || !scheme.items) return;

    const item = scheme.items.find(i => i.id === itemId);
    if (!item) return;

    if (field === 'name') {
        const cleanedName = val.trim();
        if (cleanedName === "") {
            alert("O nome do item não pode ser vazio.");
            renderStockModal();
            return;
        }
        // Verifica duplicados (ignorando o próprio item)
        if (scheme.items.some(i => i.id !== itemId && i.name.toLowerCase() === cleanedName.toLowerCase())) {
            alert("Já existe outro item com este nome.");
            renderStockModal();
            return;
        }
        item.name = cleanedName;
    } else if (field === 'qty') {
        item.qty = Math.max(val, 0);
    } else if (field === 'value') {
        item.value = Math.max(val, 0);
    } else if (field === 'type') {
        if (item.type !== val) {
            item.type = val;
            if (val === 'produto') {
                item.qty = 0; // zera estoque inicial do produto composto
                item.recipe = {}; // inicializa receita vazia
            } else {
                delete item.recipe;
                delete item.value;
            }
        }
    }

    saveState();
    renderStockModal();
};

// Atualizar a quantidade necessária de um insumo na receita do produto
window.updateItemRecipeQty = function(schemeId, productId, insumoId, qty) {
    if (!requireEditStock("Seu cargo não tem permissão para editar o estoque.")) return;
    const scheme = state.schemes.find(s => s.id === schemeId);
    if (!scheme || !scheme.items) return;

    const product = scheme.items.find(i => i.id === productId);
    if (!product || product.type !== "produto") return;

    if (!product.recipe) product.recipe = {};

    if (qty <= 0) {
        delete product.recipe[insumoId]; // remove da receita se for 0 ou menor
    } else {
        product.recipe[insumoId] = qty; // insere/altera na receita
    }

    saveState();
    renderStockModal();
};

// Adicionar Item ao Estoque do Esquema
window.addStockItem = function(e) {
    if (e) e.preventDefault();
    if (!currentStockSchemeId) return;

    const nameInput = document.getElementById("stock-item-name");
    const typeSelect = document.getElementById("stock-item-type");
    
    if (!nameInput || !typeSelect) return;

    const name = nameInput.value.trim();
    const type = typeSelect.value;

    const scheme = state.schemes.find(s => s.id === currentStockSchemeId);
    if (!scheme) return;

    if (!scheme.items) scheme.items = [];

    // Nome duplicado
    if (scheme.items.some(i => i.name.toLowerCase() === name.toLowerCase())) {
        alert("Já existe um item com este nome cadastrado no estoque.");
        return;
    }

    const newItem = {
        id: "item-" + Date.now(),
        name: name,
        type: type
    };

    if (type === "insumo") {
        newItem.qty = parseInt(document.getElementById("stock-item-qty").value) || 0;
    } else {
        newItem.qty = 0; // Inicia com 0, é gerado na composição
        newItem.value = parseMoneyValue("stock-item-value") || 0; // Salva o valor de venda
        newItem.recipe = {};

        const recipeInputs = document.querySelectorAll(".recipe-qty-input");
        let hasInsumo = false;
        recipeInputs.forEach(input => {
            const qty = parseInt(input.value) || 0;
            const insumoId = input.getAttribute("data-insumo-id");
            if (qty > 0) {
                newItem.recipe[insumoId] = qty;
                hasInsumo = true;
            }
        });

        if (!hasInsumo) {
            alert("Erro: Defina pelo menos 1 insumo na fórmula de criação.");
            return;
        }
    }

    scheme.items.push(newItem);
    saveState();
    
    // Reseta form
    document.getElementById("form-add-stock-item").reset();
    document.getElementById("stock-item-recipe-group").classList.add("hidden");
    document.getElementById("stock-item-value-group").classList.add("hidden");
    document.getElementById("stock-item-qty-group").classList.remove("hidden");

    renderStockModal();
    alert("Item cadastrado com sucesso!");
};

// Gera os campos de insumos da receita no formulário de novo produto composto
window.renderNewProductRecipeInputs = function() {
    const container = document.getElementById("recipe-inputs-container");
    if (!container || !currentStockSchemeId) return;
    const scheme = state.schemes.find(s => s.id === currentStockSchemeId);
    if (!scheme) return;

    const insumos = (scheme.items || []).filter(i => i.type === "insumo");
    if (insumos.length === 0) {
        container.innerHTML = '<p style="font-size: 11px; color: var(--color-warning); margin: 0;">Cadastre pelo menos um insumo antes de criar um produto composto.</p>';
        return;
    }

    container.innerHTML = insumos.map(ins => `
        <div class="recipe-input-row">
            <span class="recipe-input-name">${ins.name}</span>
            <input type="number" class="recipe-qty-input" data-insumo-id="${ins.id}" min="0" value="0" placeholder="0">
        </div>
    `).join("");
};

// Excluir Item de Estoque
window.deleteStockItem = async function(schemeId, itemId) {
    if (!requireEditStock("Seu cargo não tem permissão para excluir itens de estoque.")) return;
    if (!(await appConfirm("Tem certeza que deseja remover este item de estoque?", { danger: true, okText: "Remover" }))) return;

    const scheme = state.schemes.find(s => s.id === schemeId);
    if (scheme && scheme.items) {
        const item = scheme.items.find(i => i.id === itemId);
        if (item && item.type === "insumo") {
            // Valida se algum produto depende do insumo
            const dependents = scheme.items.filter(i => i.type === "produto" && i.recipe && i.recipe[itemId] !== undefined);
            if (dependents.length > 0) {
                const depNames = dependents.map(p => p.name).join(", ");
                alert(`Não é possível remover. Os produtos compostos (${depNames}) dependem deste insumo.`);
                return;
            }
        }

        scheme.items = scheme.items.filter(i => i.id !== itemId);
        saveState();
        renderStockModal();
    }
};

// Ajustar quantidade física do item
window.adjustStockItemQty = function(schemeId, itemId, qty) {
    if (!requireEditStock("Seu cargo não tem permissão para editar o estoque.")) return;
    const scheme = state.schemes.find(s => s.id === schemeId);
    if (scheme && scheme.items) {
        const item = scheme.items.find(i => i.id === itemId);
        if (item) {
            item.qty = Math.max((item.qty || 0) + qty, 0);
            saveState();
            renderStockModal();
        }
    }
};

// Produzir produto composto a partir de insumos
window.produceProduct = function(schemeId, productId) {
    if (!requireEditStock("Seu cargo não tem permissão para produzir itens de estoque.")) return;
    const scheme = state.schemes.find(s => s.id === schemeId);
    if (!scheme || !scheme.items) return;

    const product = scheme.items.find(i => i.id === productId);
    if (!product || product.type !== "produto") return;

    const qtyInput = document.getElementById(`produce-qty-${productId}`);
    const qtyToProduce = parseInt(qtyInput.value) || 1;

    if (qtyToProduce <= 0) {
        alert("Quantidade de criação inválida.");
        return;
    }

    // Validação
    for (const insumoId in product.recipe) {
        const requiredPerUnit = product.recipe[insumoId];
        const totalRequired = requiredPerUnit * qtyToProduce;
        const insumo = scheme.items.find(i => i.id === insumoId);
        const available = insumo ? insumo.qty : 0;

        if (available < totalRequired) {
            alert(`Insumos insuficientes! Você precisa de ${totalRequired}x ${insumo ? insumo.name : 'Insumo'} mas só possui ${available}x.`);
            return;
        }
    }

    // Consome insumos do estoque
    for (const insumoId in product.recipe) {
        const requiredPerUnit = product.recipe[insumoId];
        const totalRequired = requiredPerUnit * qtyToProduce;
        const insumo = scheme.items.find(i => i.id === insumoId);
        if (insumo) insumo.qty -= totalRequired;
    }

    // Adiciona ao estoque do produto final
    product.qty = (product.qty || 0) + qtyToProduce;

    saveState();
    renderStockModal();
    alert(`Sucesso! Criado: ${qtyToProduce}x ${product.name}.`);
};

// Popular o Select de Esquemas no formulário de Lançamentos com base nos Clientes (Organização)
// Instâncias reativas globais dos seletores de Lançamento
let searchableTxOrg = null;
let searchableTxScheme = null;
let searchableTxType = null;
let searchableTxStatus = null;

// Opções de Etapa do Fluxo e Status (usadas nos seletores pesquisáveis)
const TX_TYPE_OPTIONS = [
    { value: "Depósito", label: "1. Depósito (Inserção do capital)" },
    { value: "Estratificação", label: "2. Estratificação (Mescla/Transferências)" },
    { value: "Integração", label: "3. Integração (Saída como capital limpo)" },
    { value: "Venda", label: "Venda de Mercadorias/Insumos" },
    { value: "Compra", label: "Compra de Mercadorias/Insumos" }
];
// Para clientes legítimos: só as etapas de comércio real + integração
const TX_TYPE_OPTIONS_LEGAL = [
    { value: "Integração", label: "3. Integração (Saída como capital limpo)" },
    { value: "Venda", label: "Venda de Mercadorias/Insumos" },
    { value: "Compra", label: "Compra de Mercadorias/Insumos" }
];
const TX_STATUS_OPTIONS = [
    { value: "Processando", label: "Em Processamento" },
    { value: "Pendente", label: "Aguardando Envio" },
    { value: "Limpo", label: "Consolidado / Limpo" }
];
const TX_STATUS_OPTIONS_LEGAL = [
    { value: "Limpo", label: "Consolidado / Limpo" }
];

// Inicializa os seletores pesquisáveis de Etapa do Fluxo e Status
function initTxTypeStatusSelects() {
    const typeContainer = document.getElementById("tx-type-container");
    const statusContainer = document.getElementById("tx-status-container");
    if (typeContainer && !searchableTxType) {
        searchableTxType = initSearchableSelect(typeContainer, TX_TYPE_OPTIONS, {
            inputId: "tx-type",
            placeholder: "Selecione a etapa...",
            initialValue: "Depósito",
            onSelect: () => { if (window.updateTxPreview) window.updateTxPreview(); }
        });
    }
    if (statusContainer && !searchableTxStatus) {
        searchableTxStatus = initSearchableSelect(statusContainer, TX_STATUS_OPTIONS, {
            inputId: "tx-status",
            placeholder: "Selecione o status...",
            initialValue: "Processando"
        });
    }
}
document.addEventListener("DOMContentLoaded", initTxTypeStatusSelects);

function populateSchemeSelect() {
    const orgContainer = document.getElementById("tx-org-container");
    const schemeContainer = document.getElementById("tx-scheme-container");
    if (!orgContainer || !schemeContainer) return;

    // 1. Extrai organizações únicas
    const orgs = [...new Set(scopedSchemes().map(s => s.organization || "Geral"))];
    const orgOptions = orgs.map(org => ({ value: org, label: org.toUpperCase() }));

    // Salva seleções anteriores
    const prevOrgVal = searchableTxOrg ? searchableTxOrg.getValue() : "";
    const prevSchemeVal = searchableTxScheme ? searchableTxScheme.getValue() : "";

    // Inicializa o seletor de Organização (Cliente)
    searchableTxOrg = initSearchableSelect(orgContainer, orgOptions, {
        placeholder: "Selecione o cliente...",
        inputId: "tx-org",
        initialValue: orgs.includes(prevOrgVal) ? prevOrgVal : "",
        onSelect: (selectedOrg) => {
            const filteredSchemes = scopedSchemes().filter(s => (s.organization || "Geral") === selectedOrg);
            const schemeOptions = filteredSchemes.map(scheme => {
                const prefix = scheme.type === "legal" ? "[LEGÍTIMO] " : "[FACHADA] ";
                return { value: scheme.id, label: `${prefix}${scheme.name}` };
            });

            // Inicializa/atualiza o seletor de negócios
            searchableTxScheme = initSearchableSelect(schemeContainer, schemeOptions, {
                placeholder: "Selecione o negócio...",
                inputId: "tx-scheme",
                onSelect: (selectedSchemeId) => {
                    const input = document.getElementById("tx-scheme");
                    if (input) input.dispatchEvent(new Event("change"));
                }
            });
            
            const input = document.getElementById("tx-scheme");
            if (input) input.dispatchEvent(new Event("change", { bubbles: true }));
        }
    });

    // Se já havia seleção anterior compatível, reconstrói negócios e tenta restaurar
    if (prevOrgVal && orgs.includes(prevOrgVal)) {
        const filteredSchemes = scopedSchemes().filter(s => (s.organization || "Geral") === prevOrgVal);
        const schemeOptions = filteredSchemes.map(scheme => {
            const prefix = scheme.type === "legal" ? "[LEGÍTIMO] " : "[FACHADA] ";
            return { value: scheme.id, label: `${prefix}${scheme.name}` };
        });

        searchableTxScheme = initSearchableSelect(schemeContainer, schemeOptions, {
            placeholder: "Selecione o negócio...",
            inputId: "tx-scheme",
            initialValue: filteredSchemes.some(s => s.id === prevSchemeVal) ? prevSchemeVal : "",
            onSelect: (selectedSchemeId) => {
                const input = document.getElementById("tx-scheme");
                if (input) input.dispatchEvent(new Event("change"));
            }
        });
    } else {
        searchableTxScheme = initSearchableSelect(schemeContainer, [], {
            placeholder: "Selecione o negócio...",
            inputId: "tx-scheme"
        });
    }

    // O filtro de esquemas do Livro-Razão é atualizado por refreshLedgerSchemeFilter()
}

// Renderizar a tabela do Livro-Razão com filtros
function renderLedger() {
    const tableBody = document.getElementById("ledger-table-body");
    if (!tableBody) return;

    // Mantém o filtro de esquemas atualizado com os clientes atuais
    if (typeof refreshLedgerSchemeFilter === "function") refreshLedgerSchemeFilter();

    const searchEl = document.getElementById("ledger-search");
    const schemeEl = document.getElementById("ledger-filter-scheme");
    const typeEl = document.getElementById("ledger-filter-type");
    const searchVal = (searchEl ? searchEl.value : "").toLowerCase();
    const filterScheme = schemeEl ? schemeEl.value : "all";
    const filterType = typeEl ? typeEl.value : "all";
    const noRecordsMsg = document.getElementById("no-records-msg");

    tableBody.innerHTML = "";

    // Filtra as transações baseadas nos filtros
    const filteredTxs = scopedTransactions().filter(tx => {
        const scheme = state.schemes.find(s => s.id === tx.schemeId);
        const schemeName = scheme ? scheme.name.toLowerCase() : "";

        const descMatch = tx.description.toLowerCase().includes(searchVal);
        const schemeMatch = schemeName.includes(searchVal);
        const hashMatch = tx.hash.toLowerCase().includes(searchVal);
        
        const matchesSearch = descMatch || schemeMatch || hashMatch;
        const matchesScheme = filterScheme === "all" || tx.schemeId === filterScheme;
        const matchesType = filterType === "all" || tx.type === filterType;

        return matchesSearch && matchesScheme && matchesType;
    });

    if (filteredTxs.length === 0) {
        noRecordsMsg.style.display = "block";
        return;
    } else {
        noRecordsMsg.style.display = "none";
    }

    // Monta o "Origem → Destino" mostrando a ORGANIZAÇÃO (principal) e o canal (secundário)
    function buildFlowHtml(source, dest) {
        const sOrg = source ? (source.organization || "Geral") : "Org. removida";
        const sName = source ? source.name : "Canal removido";
        const dOrg = dest ? (dest.organization || "Geral") : "Org. removida";
        const dName = dest ? dest.name : "Canal removido";
        return `<div class="ledger-flow">
            <span class="flow-node"><span class="flow-org">${sOrg}</span><span class="flow-scheme">${sName}</span></span>
            <i class="fa-solid fa-arrow-right-long"></i>
            <span class="flow-node"><span class="flow-org">${dOrg}</span><span class="flow-scheme">${dName}</span></span>
        </div>`;
    }

    // Monta a linha de uma transação (reaproveitada em cada grupo).
    // Se `flow` for informado ({source, dest}), a coluna "Esquema" mostra origem → destino.
    function buildLedgerRow(tx, flow) {
        const scheme = state.schemes.find(s => s.id === tx.schemeId);
        const schemeName = scheme ? scheme.name : "Esquema Removido";

        let schemeCell;
        if (flow) {
            schemeCell = buildFlowHtml(flow.source, flow.dest);
        } else {
            schemeCell = `<strong>${schemeName}</strong>`;
        }

        let typeBadge = "";
        if (tx.type === "Depósito") typeBadge = `<span class="tx-step-badge tx-step-dep">Depósito</span>`;
        else if (tx.type === "Estratificação") typeBadge = `<span class="tx-step-badge tx-step-est">Mescla</span>`;
        else if (tx.type === "Integração") typeBadge = `<span class="tx-step-badge tx-step-int">Integração</span>`;
        else if (tx.type === "Venda") typeBadge = `<span class="tx-step-badge tx-step-venda">Venda</span>`;
        else if (tx.type === "Compra") typeBadge = `<span class="tx-step-badge tx-step-compra">Compra</span>`;
        else typeBadge = `<span class="tx-step-badge">${tx.type || '—'}</span>`;

        let statusBadge = "";
        if (tx.status === "Limpo") statusBadge = `<span class="tx-status-dot status-clean">Consolidado</span>`;
        else if (tx.status === "Processando") statusBadge = `<span class="tx-status-dot status-proc">Processando</span>`;
        else if (tx.status === "Pendente") statusBadge = `<span class="tx-status-dot status-pend">Aguardando</span>`;

        let stockBadge = '<span class="text-muted">-</span>';
        if (tx.stockMovements && tx.stockMovements.length > 0) {
            const badges = tx.stockMovements.map(mov => {
                const item = scheme && scheme.items ? scheme.items.find(i => i.id === mov.itemId) : null;
                const itemName = item ? item.name : "Item";
                const sign = mov.qty > 0 ? "+" : "";
                const color = mov.qty > 0 ? "text-success" : (mov.qty < 0 ? "text-danger" : "text-muted");
                return `<div style="font-size: 11px; margin-bottom: 2px;"><span class="${color}">${sign}${mov.qty} ${itemName}</span></div>`;
            });
            stockBadge = `<div style="display: flex; flex-direction: column;">${badges.join('')}</div>`;
        } else if (tx.stockQty !== undefined && tx.stockQty !== null && tx.stockItemId) {
            const item = scheme && scheme.items ? scheme.items.find(i => i.id === tx.stockItemId) : null;
            const itemName = item ? item.name : "Item";
            const sign = tx.stockQty > 0 ? "+" : "";
            const color = tx.stockQty > 0 ? "text-success" : (tx.stockQty < 0 ? "text-danger" : "text-muted");
            stockBadge = `<span class="${color}">${sign}${tx.stockQty} ${itemName}</span>`;
        }

        const authorLine = tx.createdBy
            ? `<div class="tx-author"><i class="fa-solid fa-user-pen"></i> ${tx.createdBy}${tx.createdAt ? ` · ${new Date(tx.createdAt).toLocaleDateString('pt-BR')}` : ''}</div>`
            : "";
        const obsLine = tx.observation
            ? `<div class="tx-obs-note"><i class="fa-solid fa-note-sticky"></i> ${tx.observation}</div>`
            : "";

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${tx.date}</td>
            <td>${schemeCell}</td>
            <td>${typeBadge}</td>
            <td>${tx.description}${obsLine}${authorLine}</td>
            <td>${formatCurrency(tx.amount)}</td>
            <td class="text-warning">${formatCurrency(tx.cost)}</td>
            <td class="text-success">${formatCurrency(tx.netAmount)}</td>
            <td>${stockBadge}</td>
            <td>${statusBadge}</td>
            <td class="hash-cell" title="Assinatura única auditável: ${tx.hash}">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <span>${tx.hash.substring(0, 10)}...${tx.hash.substring(54)}</span>
                    ${canEditDataPerm() ? `
                    <span style="display:flex; gap:2px; flex-shrink:0;">
                        <button class="btn-icon-edit" onclick="window.openEditTxModal('${tx.id}', event)" title="Editar lançamento" style="background:none; border:none; cursor:pointer; padding:4px;"><i class="fa-solid fa-pen-to-square" style="font-size:12px;"></i></button>
                        <button class="btn-icon-danger" onclick="window.deleteTransaction('${tx.id}', event)" title="Excluir lançamento" style="background:none; border:none; color:var(--color-danger); cursor:pointer; padding:4px;"><i class="fa-solid fa-trash-can" style="font-size:12px;"></i></button>
                    </span>
                    ` : ""}
                </div>
            </td>
        `;
        if (tx.editedBy) row.title = `Editado por ${tx.editedBy}${tx.editedAt ? ' em ' + new Date(tx.editedAt).toLocaleString('pt-BR') : ''}`;
        return row;
    }

    // Mapeia cada transação gerada por conversão -> { origem, destino }, via day.txIds
    const convByTxId = {};
    (state.conversions || []).forEach(conv => {
        const src = state.schemes.find(s => s.id === conv.sourceSchemeId);
        const dst = state.schemes.find(s => s.id === conv.destSchemeId);
        (conv.days || []).forEach(day => {
            (day.txIds || []).forEach(txId => {
                convByTxId[txId] = { source: src, dest: dst, conv: conv };
            });
        });
    });
    const isConvTx = (tx) => !!convByTxId[tx.id] || (tx.description || "").startsWith("[CONVERSÃO REAL]");

    // Separa: lançamentos normais (agrupados por organização) x conversões seguras (grupo próprio)
    const regularTxs = filteredTxs.filter(tx => !isConvTx(tx));
    const conversionTxs = filteredTxs.filter(tx => isConvTx(tx));

    function appendGroupHeader(iconClass, title, countText, totalAmount, totalNet, extraClass) {
        const headerRow = document.createElement("tr");
        headerRow.className = "ledger-group-header" + (extraClass ? " " + extraClass : "");
        headerRow.innerHTML = `
            <td colspan="10">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <span><i class="fa-solid ${iconClass}"></i> ${title}<span class="ledger-group-count">${countText}</span></span>
                    <span class="ledger-group-totals">Movimentado: <strong>${formatCurrency(totalAmount)}</strong> &nbsp;·&nbsp; Líquido: <strong class="text-success">${formatCurrency(totalNet)}</strong></span>
                </div>
            </td>
        `;
        tableBody.appendChild(headerRow);
    }

    // 1) Lançamentos normais agrupados por ORGANIZAÇÃO
    const groups = {};
    regularTxs.forEach(tx => {
        const scheme = state.schemes.find(s => s.id === tx.schemeId);
        const org = scheme ? (scheme.organization || "Geral") : "Sem Organização (canal removido)";
        if (!groups[org]) groups[org] = [];
        groups[org].push(tx);
    });
    const orgNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pt-BR"));
    orgNames.forEach(org => {
        const txs = groups[org].sort((a, b) => new Date(b.date) - new Date(a.date));
        const totalAmount = txs.reduce((s, t) => s + (t.amount || 0), 0);
        const totalNet = txs.reduce((s, t) => s + (t.netAmount || 0), 0);
        appendGroupHeader("fa-building-columns", org, `${txs.length} ${txs.length !== 1 ? 'lançamentos' : 'lançamento'}`, totalAmount, totalNet);
        txs.forEach(tx => tableBody.appendChild(buildLedgerRow(tx)));
    });

    // 2) Conversões Seguras — grupo separado; cada OPERAÇÃO numa linha expansível
    if (conversionTxs.length > 0) {
        // Agrupa as transações por operação (conversão). Soltas (sem operação) vão à parte.
        const ops = {};
        const loose = [];
        conversionTxs.forEach(tx => {
            const info = convByTxId[tx.id];
            if (info && info.conv) {
                const cid = info.conv.id;
                if (!ops[cid]) ops[cid] = { conv: info.conv, source: info.source, dest: info.dest, txs: [] };
                ops[cid].txs.push(tx);
            } else {
                loose.push(tx);
            }
        });

        const opList = Object.values(ops).sort((a, b) => {
            const da = Math.max.apply(null, a.txs.map(t => new Date(t.date).getTime()));
            const db = Math.max.apply(null, b.txs.map(t => new Date(t.date).getTime()));
            return db - da;
        });

        const totalAmountAll = conversionTxs.reduce((s, t) => s + (t.amount || 0), 0);
        const totalNetAll = conversionTxs.reduce((s, t) => s + (t.netAmount || 0), 0);
        const opCount = opList.length + loose.length;
        appendGroupHeader("fa-shuffle", "Conversões Seguras", `${opCount} ${opCount !== 1 ? 'operações' : 'operação'}`, totalAmountAll, totalNetAll, "ledger-group-conversion");

        opList.forEach(op => {
            const txs = op.txs.sort((a, b) => new Date(b.date) - new Date(a.date));
            const amt = txs.reduce((s, t) => s + (t.amount || 0), 0);
            const cost = txs.reduce((s, t) => s + (t.cost || 0), 0);
            const net = txs.reduce((s, t) => s + (t.netAmount || 0), 0);
            const latestDate = txs[0] ? txs[0].date : "";
            const sName = op.source ? op.source.name : "Origem";
            const dName = op.dest ? op.dest.name : "Destino";
            const opDesc = op.conv.description || "Operação de Conversão";
            const cid = op.conv.id;

            // Linha da operação — clicável para abrir o modal "Detalhes da Operação"
            const parent = document.createElement("tr");
            parent.className = "conv-parent";
            parent.setAttribute("data-conv", cid);
            parent.innerHTML = `
                <td><i class="fa-solid fa-magnifying-glass-chart conv-detail-icon"></i> ${latestDate}</td>
                <td>${buildFlowHtml(op.source, op.dest)}</td>
                <td><span class="tx-step-badge tx-step-int">Conversão</span></td>
                <td>${opDesc}<span class="conv-count">${txs.length} movimento${txs.length !== 1 ? 's' : ''}</span></td>
                <td>${formatCurrency(amt)}</td>
                <td class="text-warning">${formatCurrency(cost)}</td>
                <td class="text-success">${formatCurrency(net)}</td>
                <td class="text-muted">-</td>
                <td><span class="tx-status-dot status-clean">Consolidado</span></td>
                <td class="text-muted" title="Ver detalhes da operação"><i class="fa-solid fa-up-right-from-square" style="opacity:0.5;"></i></td>
            `;
            parent.addEventListener("click", () => {
                if (window.openMonitorDetails) window.openMonitorDetails(cid);
            });
            tableBody.appendChild(parent);
        });

        // Transações de conversão sem operação identificada — exibidas soltas
        loose.sort((a, b) => new Date(b.date) - new Date(a.date))
             .forEach(tx => tableBody.appendChild(buildLedgerRow(tx, convByTxId[tx.id])));
    }
}

// ----------------------------------------------------
// 5. OPERAÇÕES DE FORMULÁRIO E MUTADORES DO ESTADO
// ----------------------------------------------------

// Registrar novo Esquema/Canal (Clientes Ilegais)
const formScheme = document.getElementById("form-scheme");
if (formScheme) {
    formScheme.addEventListener("submit", (e) => {
        e.preventDefault();

        const org = document.getElementById("scheme-org").value.trim() || "Geral";
        const name = document.getElementById("scheme-name").value;
        const tax = parseFloat(document.getElementById("scheme-tax").value);
        const limit = parseMoneyValue("scheme-limit");
        const category = document.getElementById("scheme-category").value;
        const hasStock = document.getElementById("scheme-has-stock").checked;

        const newScheme = {
            id: "sch-" + Date.now(),
            type: "fachada",
            organization: org,
            name,
            tax,
            limit,
            category,
            hasStock,
            items: [] // Inicializa lista de itens vazia
        };

        state.schemes.push(newScheme);
        saveState();

        // Limpa formulário
        formScheme.reset();
        document.getElementById("scheme-org").value = "Geral"; // Restaura o valor padrão
        if (searchableSchemeCategory) searchableSchemeCategory.setValue("Serviços Fictícios");

        // Notificação visual simples e atualização
        renderSchemes();
        populateSchemeSelect();
        
        alert("Novo canal de fluxo operacional criado com sucesso!");
    });
}

// Registrar novo Cliente Legítimo (Legal)
const formLegalScheme = document.getElementById("form-legal-scheme");
if (formLegalScheme) {
    formLegalScheme.addEventListener("submit", (e) => {
        e.preventDefault();

        const org = document.getElementById("legal-scheme-org").value.trim() || "Geral";
        const name = document.getElementById("legal-scheme-name").value;
        const tax = parseFloat(document.getElementById("legal-scheme-tax").value);
        const limit = parseMoneyValue("legal-scheme-limit");
        const category = document.getElementById("legal-scheme-category").value;
        const hasStock = document.getElementById("legal-scheme-has-stock").checked;

        const newScheme = {
            id: "sch-" + Date.now(),
            type: "legal",
            organization: org,
            name,
            tax,
            limit,
            category,
            hasStock,
            items: [] // Inicializa lista de itens vazia
        };

        state.schemes.push(newScheme);
        saveState();

        // Limpa formulário
        formLegalScheme.reset();
        document.getElementById("legal-scheme-org").value = "Geral";
        if (searchableLegalSchemeCategory) searchableLegalSchemeCategory.setValue("Serviços Reais");

        // Notificação visual simples e atualização
        renderLegalSchemes();
        populateSchemeSelect();
        
        alert("Novo cliente legítimo criado com sucesso!");
    });
}

// Deletar Esquema
window.deleteScheme = async function(id) {
    if (!requireEditData("Seu cargo não tem permissão para excluir clientes.")) return;
    if (await appConfirm("Tem certeza que deseja desativar este canal de fluxo? Transações vinculadas continuarão no histórico.", { danger: true, okText: "Desativar" })) {
        state.schemes = state.schemes.filter(s => s.id !== id);
        saveState();
        renderSchemes();
        renderLegalSchemes();
        populateSchemeSelect();
    }
};

// ----------------------------------------------------
// Edição / Exclusão de Lançamentos (somente administradores)
// ----------------------------------------------------

// Recalcula e exibe custo/líquido no modal de edição de lançamento
window.updateEditTxPreview = function() {
    const previewEl = document.getElementById("edit-tx-preview");
    if (!previewEl) return;
    const amount = parseMoneyValue("edit-tx-amount") || 0;
    const taxEl = document.getElementById("edit-tx-tax");
    const taxPct = (taxEl && taxEl.value !== "") ? parseFloat(taxEl.value) : 0;
    const cost = amount * (taxPct / 100);
    const net = amount - cost;
    previewEl.innerHTML = `Custo: <strong class="text-warning">${formatCurrency(cost)}</strong> · Líquido: <strong class="text-success">${formatCurrency(net)}</strong>`;
};

window.openEditTxModal = function(txId, event) {
    if (event) event.stopPropagation();
    if (!requireEditData("Seu cargo não tem permissão para editar lançamentos.")) return;
    const tx = state.transactions.find(t => t.id === txId);
    if (!tx) return;

    document.getElementById("edit-tx-id").value = tx.id;
    document.getElementById("edit-tx-date").value = tx.date || "";
    document.getElementById("edit-tx-type").value = tx.type || "Depósito";
    document.getElementById("edit-tx-status").value = tx.status || "Processando";
    document.getElementById("edit-tx-desc").value = tx.description || "";
    document.getElementById("edit-tx-obs").value = tx.observation || "";
    window.setMoneyValue("edit-tx-amount", tx.amount || 0);

    // Deriva a taxa a partir do custo/valor já registrados (fallback: taxa do esquema)
    let taxPct = 0;
    if (tx.amount && tx.cost !== undefined && tx.cost !== null && tx.amount !== 0) {
        taxPct = (tx.cost / tx.amount) * 100;
    } else {
        const scheme = state.schemes.find(s => s.id === tx.schemeId);
        taxPct = scheme ? (scheme.tax || 0) : 0;
    }
    // Arredonda para no máximo 2 casas para não poluir o campo
    document.getElementById("edit-tx-tax").value = Math.round(taxPct * 100) / 100;

    window.updateEditTxPreview();
    const modal = document.getElementById("modal-edit-tx");
    if (modal) modal.style.display = "flex";
};

window.closeEditTxModal = function() {
    const modal = document.getElementById("modal-edit-tx");
    if (modal) modal.style.display = "none";
};

window.deleteTransaction = async function(txId, event) {
    if (event) event.stopPropagation();
    if (!requireEditData("Seu cargo não tem permissão para excluir lançamentos.")) return;
    if (!(await appConfirm("Excluir este lançamento do Livro-Razão? Esta ação não pode ser desfeita.", { danger: true, okText: "Excluir" }))) return;
    state.transactions = state.transactions.filter(t => t.id !== txId);
    saveState();
    if (typeof renderLedger === "function") renderLedger();
    if (typeof updateDashboard === "function") updateDashboard();
    if (typeof renderCharts === "function") renderCharts();
};

// Submit do formulário de edição de lançamento
const formEditTx = document.getElementById("form-edit-tx");
if (formEditTx) {
    // Preview ao vivo
    ["edit-tx-amount", "edit-tx-tax"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", window.updateEditTxPreview);
    });

    formEditTx.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!requireEditData("Seu cargo não tem permissão para editar lançamentos.")) return;

        const txId = document.getElementById("edit-tx-id").value;
        const idx = state.transactions.findIndex(t => t.id === txId);
        if (idx === -1) { window.closeEditTxModal(); return; }
        const tx = state.transactions[idx];

        const amount = parseMoneyValue("edit-tx-amount") || 0;
        const taxEl = document.getElementById("edit-tx-tax");
        const taxPct = (taxEl && taxEl.value !== "") ? parseFloat(taxEl.value) : 0;
        const cost = amount * (taxPct / 100);
        const netAmount = amount - cost;

        tx.date = document.getElementById("edit-tx-date").value || tx.date;
        tx.type = document.getElementById("edit-tx-type").value;
        tx.status = document.getElementById("edit-tx-status").value;
        tx.description = document.getElementById("edit-tx-desc").value;
        tx.observation = document.getElementById("edit-tx-obs").value.trim();
        tx.amount = amount;
        tx.cost = cost;
        tx.netAmount = netAmount;
        tx.editedBy = currentTxUser();
        tx.editedAt = new Date().toISOString();

        // Regenera a assinatura encadeada usando o lançamento anterior como base
        const previousHash = idx > 0 ? state.transactions[idx - 1].hash : "0000000000000000000000000000000000000000000000000000000000000000";
        const { hash, ...hashInput } = tx; // não inclui o hash antigo no cálculo
        tx.hash = generateHash(hashInput, previousHash);

        saveState();
        window.closeEditTxModal();
        if (typeof renderLedger === "function") renderLedger();
        if (typeof updateDashboard === "function") updateDashboard();
        if (typeof renderCharts === "function") renderCharts();
    });
}

// Instância global do seletor da modal de edição
let searchableEditSchemeCategory = null;

// Abrir modal de edição do esquema
window.openEditSchemeModal = function(schemeId, event) {
    if (event) event.stopPropagation();
    if (!requireEditData("Seu cargo não tem permissão para editar clientes.")) return;
    const scheme = state.schemes.find(s => s.id === schemeId);
    if (!scheme) return;

    document.getElementById("edit-scheme-id").value = scheme.id;
    document.getElementById("edit-scheme-org").value = scheme.organization || "Geral";
    document.getElementById("edit-scheme-name").value = scheme.name;
    document.getElementById("edit-scheme-tax").value = scheme.tax;
    window.setMoneyValue("edit-scheme-limit", scheme.limit);
    document.getElementById("edit-scheme-has-stock").checked = !!scheme.hasStock;

    const schemeType = scheme.type || "fachada";
    document.getElementById("edit-scheme-type").value = schemeType;
    window.toggleSchemeTypeFields(schemeType, 'edit-scheme-tax-label');

    // Define as opções de categoria dinamicamente e inicializa o searchable dropdown
    const catContainer = document.getElementById("edit-scheme-category-container");
    const labelEl = document.getElementById("edit-scheme-category-label");
    
    const catOptions = [
        { value: "Serviços Fictícios", label: "Serviços Fictícios (Consultoria/Palestras)" },
        { value: "Comércio de Fachada", label: "Comércio de Fachada (Restaurante/Lavanderia)" },
        { value: "Fracionamento", label: "Fracionamento (Smurfing/Depósitos)" },
        { value: "Aquisição de Ativos", label: "Aquisição de Ativos (Imóveis/Arte)" },
        { value: "Outro", label: "Outro Método Personalizado" }
    ];

    const legalCatOptions = [
        { value: "Serviços Reais", label: "Serviços Legítimos (Desenvolvimento/Consultoria)" },
        { value: "Comércio Legítimo", label: "Comércio Físico (Alimentos/Vestuário)" },
        { value: "Administradora de Ativos", label: "Holding / Administradora de Bens (Imóveis/Títulos)" },
        { value: "Outro", label: "Outra Categoria Comercial" }
    ];

    const activeOptions = (schemeType === "legal") ? legalCatOptions : catOptions;
    if (labelEl) {
        labelEl.textContent = (schemeType === "legal") ? "Ramo / Categoria Comercial" : "Método/Categoria de Estratificação";
    }

    if (catContainer) {
        searchableEditSchemeCategory = initSearchableSelect(catContainer, activeOptions, {
            placeholder: "Selecione a categoria...",
            inputId: "edit-scheme-category",
            initialValue: scheme.category || ""
        });
    }

    const modal = document.getElementById("modal-edit-scheme");
    if (modal) modal.style.display = "flex";
};

// Fechar modal de edição
window.closeEditSchemeModal = function() {
    const modal = document.getElementById("modal-edit-scheme");
    if (modal) modal.style.display = "none";
    if (searchableEditSchemeCategory) searchableEditSchemeCategory.reset();
};

// Event listener para submeter edição do esquema
const formEditScheme = document.getElementById("form-edit-scheme");
if (formEditScheme) {
    formEditScheme.addEventListener("submit", (e) => {
        e.preventDefault();

        const id = document.getElementById("edit-scheme-id").value;
        const org = document.getElementById("edit-scheme-org").value.trim() || "Geral";
        const name = document.getElementById("edit-scheme-name").value;
        const tax = parseFloat(document.getElementById("edit-scheme-tax").value);
        const limit = parseMoneyValue("edit-scheme-limit");
        const category = document.getElementById("edit-scheme-category").value;
        const hasStock = document.getElementById("edit-scheme-has-stock").checked;
        const type = document.getElementById("edit-scheme-type").value;

        const scheme = state.schemes.find(s => s.id === id);
        if (scheme) {
            scheme.organization = org;
            scheme.name = name;
            scheme.tax = tax;
            scheme.limit = limit;
            scheme.category = category;
            scheme.type = type;
            
            // Se mudou de sem estoque para com estoque, inicializa itens
            if (hasStock && !scheme.hasStock) {
                scheme.items = scheme.items || [];
            }
            scheme.hasStock = hasStock;

            saveState();
            closeEditSchemeModal();
            renderSchemes();
            renderLegalSchemes();
            populateSchemeSelect();
            alert("Canal de fluxo operacional atualizado com sucesso!");
        }
    });
}

// Preview do cálculo de taxa do Lançamento Direto
window.updateTxPreview = function() {
    const amountEl = document.getElementById("tx-amount");
    if (!amountEl) return;
    const taxEl = document.getElementById("tx-tax");
    const enabledEl = document.getElementById("tx-tax-enabled");

    const amount = parseMoneyValue("tx-amount") || 0;
    const enabled = !enabledEl || enabledEl.checked;
    const taxPct = enabled ? (parseFloat(taxEl && taxEl.value) || 0) : 0;
    const cost = amount * (taxPct / 100);
    const net = amount - cost;

    // Imposto legal (cascata: incide sobre o líquido após a taxa) — igual à conversão segura
    const legalEl = document.getElementById("tx-legal-tax");
    const legalEnabledEl = document.getElementById("tx-legal-tax-enabled");
    const legalEnabled = !!(legalEnabledEl && legalEnabledEl.checked);
    const legalPct = legalEnabled ? (parseFloat(legalEl && legalEl.value) || 0) : 0;
    const legalCost = net * (legalPct / 100);
    const finalNet = net - legalCost;

    const bruto = document.getElementById("tx-preview-bruto");
    const taxaRow = document.getElementById("tx-preview-taxa-row");
    const taxaPct = document.getElementById("tx-preview-taxa-pct");
    const taxa = document.getElementById("tx-preview-taxa");
    const legalRow = document.getElementById("tx-preview-legal-row");
    const legalPctEl = document.getElementById("tx-preview-legal-pct");
    const legalEl2 = document.getElementById("tx-preview-legal");
    const liquido = document.getElementById("tx-preview-liquido");

    if (bruto) bruto.textContent = formatCurrency(amount);
    if (taxaPct) taxaPct.textContent = String(taxPct).replace(".", ",");
    if (taxa) taxa.textContent = "- " + formatCurrency(cost);
    if (taxaRow) taxaRow.style.opacity = enabled ? "1" : "0.4";
    // Linha do imposto legal só aparece quando ativada
    if (legalRow) legalRow.style.display = legalEnabled ? "flex" : "none";
    if (legalPctEl) legalPctEl.textContent = String(legalPct).replace(".", ",");
    if (legalEl2) legalEl2.textContent = "- " + formatCurrency(legalCost);
    if (liquido) liquido.textContent = formatCurrency(finalNet);
};

// Liga/desliga o campo de taxa conforme o toggle "Aplicar"
window.toggleTxTax = function() {
    const taxEl = document.getElementById("tx-tax");
    const enabledEl = document.getElementById("tx-tax-enabled");
    if (!taxEl || !enabledEl) return;
    // Campo desabilitado não entra na validação "required" do form
    taxEl.disabled = !enabledEl.checked;
    taxEl.style.opacity = enabledEl.checked ? "1" : "0.4";
    window.updateTxPreview();
};

// Preenche o imposto legal automaticamente pela tabela progressiva (igual à conversão segura),
// com base no valor informado. Só age quando o imposto legal está ativado.
window.autofillTxLegalTax = function() {
    const legalEl = document.getElementById("tx-legal-tax");
    const legalEnabledEl = document.getElementById("tx-legal-tax-enabled");
    if (!legalEl || !legalEnabledEl || !legalEnabledEl.checked) return;
    const amount = parseMoneyValue("tx-amount") || 0;
    legalEl.value = calculateProgressiveTax(amount);
};

// Liga/desliga o campo de imposto legal conforme o toggle "Aplicar"
window.toggleTxLegalTax = function() {
    const legalEl = document.getElementById("tx-legal-tax");
    const legalEnabledEl = document.getElementById("tx-legal-tax-enabled");
    if (!legalEl || !legalEnabledEl) return;
    legalEl.disabled = !legalEnabledEl.checked;
    legalEl.style.opacity = legalEnabledEl.checked ? "1" : "0.4";
    // Ao ativar, calcula automaticamente pela tabela progressiva conforme o valor
    if (legalEnabledEl.checked) window.autofillTxLegalTax();
    window.updateTxPreview();
};

document.addEventListener("DOMContentLoaded", () => {
    const amountEl = document.getElementById("tx-amount");
    const taxEl = document.getElementById("tx-tax");
    const enabledEl = document.getElementById("tx-tax-enabled");
    // Ao mudar o valor, recalcula o imposto legal automaticamente (tabela progressiva)
    if (amountEl) amountEl.addEventListener("input", () => {
        window.autofillTxLegalTax();
        window.updateTxPreview();
    });
    if (taxEl) taxEl.addEventListener("input", window.updateTxPreview);
    if (enabledEl) enabledEl.addEventListener("change", window.toggleTxTax);

    const legalEl = document.getElementById("tx-legal-tax");
    const legalEnabledEl = document.getElementById("tx-legal-tax-enabled");
    if (legalEl) legalEl.addEventListener("input", window.updateTxPreview);
    if (legalEnabledEl) legalEnabledEl.addEventListener("change", window.toggleTxLegalTax);

    window.updateTxPreview();
});

// Registrar nova Transação
const formTx = document.getElementById("form-transaction");
if (formTx) {
    formTx.addEventListener("submit", (e) => {
        e.preventDefault();

        const schemeId = document.getElementById("tx-scheme").value;
        const amount = parseMoneyValue("tx-amount");
        const date = document.getElementById("tx-date").value;
        const type = document.getElementById("tx-type").value;
        const status = document.getElementById("tx-status").value;
        const description = document.getElementById("tx-desc").value;

        const scheme = state.schemes.find(s => s.id === schemeId);
        if (!scheme) {
            alert("Esquema inválido selecionado.");
            return;
        }

        // Calcula taxas e valores líquidos (respeitando o toggle "Aplicar taxa")
        const txTaxInput = document.getElementById("tx-tax");
        const txTaxEnabled = document.getElementById("tx-tax-enabled");
        let appliedTax;
        if (txTaxEnabled && !txTaxEnabled.checked) {
            appliedTax = 0; // taxa desativada pelo usuário
        } else {
            appliedTax = (txTaxInput && txTaxInput.value !== "") ? parseFloat(txTaxInput.value) : scheme.tax;
        }
        const taxCost = amount * (appliedTax / 100);
        const afterTax = amount - taxCost;

        // Imposto legal em cascata (incide sobre o líquido após a taxa) — igual à conversão segura
        const txLegalInput = document.getElementById("tx-legal-tax");
        const txLegalEnabled = document.getElementById("tx-legal-tax-enabled");
        let appliedLegalTax = 0;
        if (txLegalEnabled && txLegalEnabled.checked) {
            appliedLegalTax = (txLegalInput && txLegalInput.value !== "") ? parseFloat(txLegalInput.value) : 0;
        }
        const legalCost = afterTax * (appliedLegalTax / 100);

        // Custo total = taxa de operação + imposto legal; líquido final desconta os dois
        const cost = taxCost + legalCost;
        const netAmount = afterTax - legalCost;

        // Captura a movimentação de estoque se o esquema possuir controle
        const stockMovements = [];
        if (scheme.hasStock) {
            const container = document.getElementById("tx-stock-movements-container");
            if (container) {
                const rows = container.querySelectorAll(".stock-movement-row");
                rows.forEach(row => {
                    const hiddenInput = row.querySelector(".stock-item-id");
                    const input = row.querySelector(".stock-qty-input");
                    if (hiddenInput && input && hiddenInput.value && input.value !== "") {
                        const qty = parseInt(input.value);
                        stockMovements.push({
                            itemId: hiddenInput.value,
                            qty: qty
                        });

                        // Atualiza o estoque do item correspondente no esquema
                        const item = scheme.items.find(i => i.id === hiddenInput.value);
                        if (item) {
                            item.qty = Math.max((item.qty || 0) + qty, 0);
                        }
                    }
                });
            }
        }

        // Cria a transação básica
        const txData = {
            id: "tx-" + Date.now(),
            schemeId,
            amount,
            date,
            type,
            status,
            description,
            cost,
            netAmount,
            taxRate: appliedTax,
            legalTaxRate: appliedLegalTax,
            legalTaxCost: legalCost,
            stockItemId: stockMovements.length > 0 ? stockMovements[0].itemId : "",
            stockQty: stockMovements.length > 0 ? stockMovements[0].qty : null,
            stockMovements: stockMovements,
            observation: (document.getElementById("tx-obs") ? document.getElementById("tx-obs").value.trim() : ""),
            createdBy: currentTxUser(),
            createdAt: new Date().toISOString()
        };

        // Encadeamento do hash do ledger imutável (simulação de blockchain/corrente)
        const previousHash = getLatestHash();
        txData.hash = generateHash(txData, previousHash);

        state.transactions.push(txData);
        saveState();

        // Reseta o formulário, mas mantém a data útil e esconde os campos de estoque
        formTx.reset();
        
        // Reseta as instâncias de searchable dropdowns e o campo de taxa após o reset do form
        if (searchableTxOrg) searchableTxOrg.reset();
        if (searchableTxScheme) searchableTxScheme.reset();
        if (txTaxInput) {
            txTaxInput.value = "";
        }
        // Reseta o imposto legal (volta ao padrão: desligado e vazio) e re-sincroniza os toggles
        if (txLegalInput) txLegalInput.value = "";
        if (txLegalEnabled) txLegalEnabled.checked = false;
        if (window.toggleTxLegalTax) window.toggleTxLegalTax();

        // Reabilita todas as opções de etapa e status após o reset do form
        // Restaura as opções completas e os valores padrão dos seletores pesquisáveis
        if (searchableTxType) {
            searchableTxType.updateOptions(TX_TYPE_OPTIONS);
            searchableTxType.setValue("Depósito");
        }
        if (searchableTxStatus) {
            searchableTxStatus.updateOptions(TX_STATUS_OPTIONS);
            searchableTxStatus.setValue("Processando");
        }

        setTodayDate();
        populateSchemeSelect();
        
        const txStockMovementsSection = document.getElementById("tx-stock-movements-section");
        const txStockMovementsContainer = document.getElementById("tx-stock-movements-container");
        if (txStockMovementsSection) txStockMovementsSection.classList.add("hidden");
        if (txStockMovementsContainer) txStockMovementsContainer.innerHTML = "";

        alert("Transação registrada no livro-razão criptográfico!");
    });
}

// Event Listener para exibir/ocultar e popular dinamicamente os campos de estoque no Lançamento
document.addEventListener("DOMContentLoaded", () => {
    const txSchemeSelect = document.getElementById("tx-scheme");
    const txStockMovementsSection = document.getElementById("tx-stock-movements-section");
    const txStockMovementsContainer = document.getElementById("tx-stock-movements-container");
    const btnAddStockMovement = document.getElementById("btn-add-stock-movement");

    // Retorna os itens que devem aparecer no dropdown de movimentação,
    // respeitando o filtro "Mostrar apenas produtos finais".
    function getStockDropdownItems(scheme) {
        const items = (scheme && scheme.items) || [];
        const onlyProducts = document.getElementById("tx-stock-products-only");
        if (onlyProducts && onlyProducts.checked) {
            return items.filter(i => i.type === "produto");
        }
        return items;
    }

    function addStockMovementRow(selectedItemId = "", qtyVal = "") {
        if (!txStockMovementsContainer) return;

        const selectedSchemeId = document.getElementById("tx-scheme").value;
        const selectedScheme = state.schemes.find(s => s.id === selectedSchemeId);
        if (!selectedScheme) return;

        const row = document.createElement("div");
        row.className = "stock-movement-row";

        // Cria a estrutura do Searchable Dropdown
        const selectContainer = document.createElement("div");
        selectContainer.className = "searchable-select-container";

        const hiddenInput = document.createElement("input");
        hiddenInput.type = "hidden";
        hiddenInput.className = "stock-item-id";
        hiddenInput.name = "stock-item-id";
        hiddenInput.required = true;
        if (selectedItemId) hiddenInput.value = selectedItemId;

        const trigger = document.createElement("div");
        trigger.className = "searchable-select-trigger";
        
        let initialText = "Selecione o item...";
        if (selectedItemId) {
            const item = selectedScheme.items.find(i => i.id === selectedItemId);
            if (item) {
                initialText = `${item.name} (${item.qty} un.)`;
                if (item.type === "produto" && item.value) {
                    initialText += ` - ${formatCurrency(item.value)}`;
                }
            }
        }
        
        trigger.innerHTML = `<span>${initialText}</span><i class="fa-solid fa-chevron-down"></i>`;

        const dropdown = document.createElement("div");
        dropdown.className = "searchable-select-dropdown hidden";

        const searchWrapper = document.createElement("div");
        searchWrapper.className = "searchable-select-search-wrapper";
        searchWrapper.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><input type="text" class="searchable-select-search" placeholder="Pesquisar item...">`;

        const optionsContainer = document.createElement("div");
        optionsContainer.className = "searchable-select-options";

        // Popula as opções do dropdown
        function populateOptions(filterText = "") {
            optionsContainer.innerHTML = "";
            const items = getStockDropdownItems(selectedScheme);
            const filteredItems = items.filter(item =>
                item.name.toLowerCase().includes(filterText.toLowerCase())
            );

            if (filteredItems.length === 0) {
                const emptyOption = document.createElement("div");
                emptyOption.className = "searchable-option text-muted";
                emptyOption.textContent = "Nenhum item encontrado";
                optionsContainer.appendChild(emptyOption);
                return;
            }

            filteredItems.forEach(item => {
                const option = document.createElement("div");
                option.className = "searchable-option";
                if (hiddenInput.value === item.id) {
                    option.classList.add("selected");
                }
                option.setAttribute("data-id", item.id);
                
                let text = `${item.name} (${item.qty} un.)`;
                if (item.type === "produto" && item.value) {
                    text += ` - ${formatCurrency(item.value)}`;
                }
                option.textContent = text;

                option.addEventListener("click", () => {
                    hiddenInput.value = item.id;
                    trigger.querySelector("span").textContent = text;
                    dropdown.classList.add("hidden");
                    selectContainer.classList.remove("open");
                    
                    recalculateSuggestedAmount();
                });

                optionsContainer.appendChild(option);
            });
        }

        populateOptions();

        // Escuta digitação para filtrar
        const searchInput = searchWrapper.querySelector(".searchable-select-search");
        searchInput.addEventListener("input", (e) => {
            populateOptions(e.target.value);
        });

        // Toggle do dropdown
        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".searchable-select-container").forEach(c => {
                if (c !== selectContainer) {
                    c.classList.remove("open");
                    const drop = c.querySelector(".searchable-select-dropdown");
                    if (drop) drop.classList.add("hidden");
                }
            });

            const isOpen = selectContainer.classList.toggle("open");
            if (isOpen) {
                dropdown.classList.remove("hidden");
                searchInput.value = "";
                populateOptions();
                setTimeout(() => searchInput.focus(), 50);
            } else {
                dropdown.classList.add("hidden");
            }
        });

        dropdown.appendChild(searchWrapper);
        dropdown.appendChild(optionsContainer);

        selectContainer.appendChild(hiddenInput);
        selectContainer.appendChild(trigger);
        selectContainer.appendChild(dropdown);

        // Input de quantidade
        const input = document.createElement("input");
        input.type = "number";
        input.className = "stock-qty-input";
        input.placeholder = "Qtd (Ex: -2)";
        input.required = true;
        if (qtyVal) input.value = qtyVal;

        // Botão de remover
        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "btn-remove-row";
        btnRemove.innerHTML = '<i class="fa-solid fa-trash"></i>';
        btnRemove.addEventListener("click", () => {
            row.remove();
            recalculateSuggestedAmount();
        });

        input.addEventListener("input", recalculateSuggestedAmount);

        row.appendChild(selectContainer);
        row.appendChild(input);
        row.appendChild(btnRemove);

        txStockMovementsContainer.appendChild(row);
    }

    window.addStockMovementRowGlobal = addStockMovementRow; // Expõe globalmente caso necessário

    function recalculateSuggestedAmount() {
        const selectedSchemeId = document.getElementById("tx-scheme").value;
        const selectedScheme = state.schemes.find(s => s.id === selectedSchemeId);
        if (!selectedScheme) return;

        let totalValue = 0;
        let hasVenda = false;

        const rows = txStockMovementsContainer.querySelectorAll(".stock-movement-row");
        rows.forEach(row => {
            const hiddenInput = row.querySelector(".stock-item-id");
            const input = row.querySelector(".stock-qty-input");
            
            if (hiddenInput && input && hiddenInput.value) {
                const item = selectedScheme.items.find(i => i.id === hiddenInput.value);
                const qty = parseInt(input.value) || 0;
                
                // Se for venda de produto (quantidade negativa)
                if (item && item.type === "produto" && item.value && qty < 0) {
                    totalValue += Math.abs(qty) * item.value;
                    hasVenda = true;
                }
            }
        });

        if (hasVenda && totalValue > 0) {
            const txAmountInput = document.getElementById("tx-amount");
            if (txAmountInput) {
                setMoneyValue("tx-amount", totalValue);
            }
        }
    }

    if (btnAddStockMovement) {
        btnAddStockMovement.addEventListener("click", () => {
            addStockMovementRow();
        });
    }

    // Filtro "apenas produtos finais": fecha dropdowns abertos para reabrirem já filtrados
    const stockProductsOnly = document.getElementById("tx-stock-products-only");
    if (stockProductsOnly) {
        stockProductsOnly.addEventListener("change", () => {
            document.querySelectorAll("#tx-stock-movements-container .searchable-select-container.open").forEach(c => {
                c.classList.remove("open");
                const d = c.querySelector(".searchable-select-dropdown");
                if (d) d.classList.add("hidden");
            });
        });
    }

    // O select pesquisável recria o input #tx-scheme a cada populateSchemeSelect(),
    // então o listener é ligado ao container estável (#tx-scheme-container) via delegação
    // e lê sempre o elemento atual — senão a taxa/etapas nunca atualizam.
    const txSchemeContainer = document.getElementById("tx-scheme-container");
    if (txSchemeContainer && txStockMovementsSection && txStockMovementsContainer) {
        txSchemeContainer.addEventListener("change", () => {
            const curScheme = document.getElementById("tx-scheme");
            const selectedSchemeId = curScheme ? curScheme.value : "";
            const selectedScheme = state.schemes.find(s => s.id === selectedSchemeId);
            
            const txTaxInput = document.getElementById("tx-tax");
            if (txTaxInput) {
                txTaxInput.value = selectedScheme ? selectedScheme.tax : "";
            }
            if (window.updateTxPreview) window.updateTxPreview();

            const isLegal = selectedScheme && selectedScheme.type === "legal";

            if (isLegal) {
                // Cliente legítimo: etapas de comércio real + Integração; status sempre Consolidado
                if (searchableTxType) {
                    searchableTxType.updateOptions(TX_TYPE_OPTIONS_LEGAL);
                    if (["Depósito", "Estratificação"].includes(searchableTxType.getValue())) {
                        searchableTxType.setValue("Integração");
                    }
                }
                if (searchableTxStatus) {
                    searchableTxStatus.updateOptions(TX_STATUS_OPTIONS_LEGAL);
                    searchableTxStatus.setValue("Limpo");
                }
            } else {
                // Fachada: todas as etapas e status disponíveis
                if (searchableTxType) searchableTxType.updateOptions(TX_TYPE_OPTIONS);
                if (searchableTxStatus) searchableTxStatus.updateOptions(TX_STATUS_OPTIONS);
            }

            if (selectedScheme && selectedScheme.hasStock) {
                txStockMovementsSection.classList.remove("hidden");
                // Se o container estiver vazio, adiciona pelo menos 1 linha padrão
                if (txStockMovementsContainer.children.length === 0) {
                    addStockMovementRow();
                } else {
                    // Re-popula os dropdowns ativos com as opções do novo negócio
                    const rows = txStockMovementsContainer.querySelectorAll(".stock-movement-row");
                    rows.forEach(row => {
                        const selectContainer = row.querySelector(".searchable-select-container");
                        if (selectContainer) {
                            const hiddenInput = selectContainer.querySelector(".stock-item-id");
                            const triggerSpan = selectContainer.querySelector(".searchable-select-trigger span");
                            const prevVal = hiddenInput ? hiddenInput.value : "";
                            
                            // Limpa e redefine
                            if (hiddenInput) hiddenInput.value = "";
                            if (triggerSpan) triggerSpan.textContent = "Selecione o item...";
                            
                            const optionsContainer = selectContainer.querySelector(".searchable-select-options");
                            const searchInput = selectContainer.querySelector(".searchable-select-search");
                            if (searchInput) searchInput.value = "";

                            function populateOptions(filterText = "") {
                                if (!optionsContainer) return;
                                optionsContainer.innerHTML = "";
                                const items = getStockDropdownItems(selectedScheme);
                                const filteredItems = items.filter(item =>
                                    item.name.toLowerCase().includes(filterText.toLowerCase())
                                );

                                if (filteredItems.length === 0) {
                                    const emptyOption = document.createElement("div");
                                    emptyOption.className = "searchable-option text-muted";
                                    emptyOption.textContent = "Nenhum item encontrado";
                                    optionsContainer.appendChild(emptyOption);
                                    return;
                                }

                                filteredItems.forEach(item => {
                                    const option = document.createElement("div");
                                    option.className = "searchable-option";
                                    if (hiddenInput && hiddenInput.value === item.id) {
                                        option.classList.add("selected");
                                    }
                                    option.setAttribute("data-id", item.id);
                                    
                                    let text = `${item.name} (${item.qty} un.)`;
                                    if (item.type === "produto" && item.value) {
                                        text += ` - ${formatCurrency(item.value)}`;
                                    }
                                    option.textContent = text;

                                    option.addEventListener("click", () => {
                                        if (hiddenInput) hiddenInput.value = item.id;
                                        if (triggerSpan) triggerSpan.textContent = text;
                                        const dropdown = selectContainer.querySelector(".searchable-select-dropdown");
                                        if (dropdown) dropdown.classList.add("hidden");
                                        selectContainer.classList.remove("open");
                                        
                                        recalculateSuggestedAmount();
                                    });

                                    optionsContainer.appendChild(option);
                                });
                            }

                            // Verifica se o valor antigo ainda existe no novo negócio e restaura
                            if (prevVal && selectedScheme.items.some(i => i.id === prevVal)) {
                                const item = selectedScheme.items.find(i => i.id === prevVal);
                                if (hiddenInput) hiddenInput.value = prevVal;
                                let text = `${item.name} (${item.qty} un.)`;
                                if (item.type === "produto" && item.value) {
                                    text += ` - ${formatCurrency(item.value)}`;
                                }
                                if (triggerSpan) triggerSpan.textContent = text;
                            }

                            populateOptions();

                            if (searchInput) {
                                const newSearchInput = searchInput.cloneNode(true);
                                searchInput.parentNode.replaceChild(newSearchInput, searchInput);
                                newSearchInput.addEventListener("input", (e) => {
                                    populateOptions(e.target.value);
                                });
                            }
                        }
                    });
                }
            } else {
                txStockMovementsSection.classList.add("hidden");
                txStockMovementsContainer.innerHTML = "";
            }
        });
    }

    // Fechar dropdowns de busca ao clicar fora
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".searchable-select-container")) {
            document.querySelectorAll(".searchable-select-container").forEach(c => {
                c.classList.remove("open");
                const drop = c.querySelector(".searchable-select-dropdown");
                if (drop) drop.classList.add("hidden");
            });
        }
    });

    // Configurar fechar o modal
    const btnClose = document.getElementById("btn-close-stock-modal");
    if (btnClose) btnClose.addEventListener("click", closeStockModal);

    const modal = document.getElementById("modal-manage-stock");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closeStockModal();
            }
        });
    }

    // Alternar campos de adição de novo item de estoque (Insumo vs Produto)
    const itemTypeSelect = document.getElementById("stock-item-type");
    const itemQtyGroup = document.getElementById("stock-item-qty-group");
    const itemValueGroup = document.getElementById("stock-item-value-group");
    const itemRecipeGroup = document.getElementById("stock-item-recipe-group");

    if (itemTypeSelect && itemQtyGroup && itemValueGroup && itemRecipeGroup) {
        itemTypeSelect.addEventListener("change", () => {
            if (itemTypeSelect.value === "produto") {
                itemQtyGroup.classList.add("hidden");
                itemValueGroup.classList.remove("hidden");
                itemRecipeGroup.classList.remove("hidden");
                window.renderNewProductRecipeInputs();
            } else {
                itemQtyGroup.classList.remove("hidden");
                itemValueGroup.classList.add("hidden");
                itemRecipeGroup.classList.add("hidden");
            }
        });
    }

    // Formulário de adicionar item ao estoque
    const formAddItem = document.getElementById("form-add-stock-item");
    if (formAddItem) {
        formAddItem.addEventListener("submit", addStockItem);
    }
});

// Definir data de hoje por padrão nos campos date
function setTodayDate() {
    const dateInput = document.getElementById("tx-date");
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}

// Ações do Livro-Razão (Limpeza e Exportação)
const btnExport = document.getElementById("btn-export-json");
if (btnExport) {
    btnExport.addEventListener("click", () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 4));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `laundrflow_ledger_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });
}

const btnClear = document.getElementById("btn-clear-ledger");
if (btnClear) {
    btnClear.addEventListener("click", async () => {
        if (!canEditDataPerm()) {
            await appConfirm("Seu cargo não tem permissão para apagar dados.", { okText: "Entendi" });
            return;
        }
        const ok = await appConfirm(
            "ATENÇÃO: Isso apaga TODOS os lançamentos para TODOS os usuários, no servidor. Os clientes cadastrados (e o estoque deles) são mantidos. Esta ação NÃO pode ser desfeita. Confirma?",
            { danger: true, okText: "Apagar lançamentos" }
        );
        if (!ok) return;

        // Apaga só os lançamentos (mantém clientes/esquemas). Sincroniza com o servidor.
        state.transactions = [];
        saveState(); // grava local + envia ao servidor

        // Re-renderiza as telas
        if (typeof updateDashboard === "function") updateDashboard();
        if (typeof renderSchemes === "function") renderSchemes();
        if (typeof renderLegalSchemes === "function") renderLegalSchemes();
        if (window.renderConversions) window.renderConversions();
        if (typeof renderLedger === "function") renderLedger();
        if (typeof populateSchemeSelect === "function") populateSchemeSelect();
    });
}

// Filtros em tempo real no ledger
// Filtros do Livro-Razão (seletores pesquisáveis)
let searchableLedgerScheme = null;
let searchableLedgerType = null;

function refreshLedgerSchemeFilter() {
    if (!searchableLedgerScheme) return;
    const opts = [{ value: "all", label: "Todos os Esquemas" }].concat(
        scopedSchemes().map(s => ({ value: s.id, label: `${s.name} (${s.organization || 'Geral'})` }))
    );
    const cur = searchableLedgerScheme.getValue();
    searchableLedgerScheme.updateOptions(opts);
    if (!opts.some(o => o.value === cur)) searchableLedgerScheme.setValue("all");
}

function initLedgerFilters() {
    const schemeC = document.getElementById("ledger-filter-scheme-container");
    const typeC = document.getElementById("ledger-filter-type-container");
    if (schemeC && !searchableLedgerScheme) {
        searchableLedgerScheme = initSearchableSelect(schemeC, [{ value: "all", label: "Todos os Esquemas" }], {
            inputId: "ledger-filter-scheme", placeholder: "Todos os Esquemas", initialValue: "all",
            required: false, onSelect: () => renderLedger()
        });
    }
    if (typeC && !searchableLedgerType) {
        const typeOpts = [
            { value: "all", label: "Todas as Etapas" },
            { value: "Depósito", label: "Depósito" },
            { value: "Estratificação", label: "Estratificação" },
            { value: "Integração", label: "Integração" },
            { value: "Venda", label: "Venda de Mercadorias/Insumos" },
            { value: "Compra", label: "Compra de Mercadorias/Insumos" }
        ];
        searchableLedgerType = initSearchableSelect(typeC, typeOpts, {
            inputId: "ledger-filter-type", placeholder: "Todas as Etapas", initialValue: "all",
            required: false, onSelect: () => renderLedger()
        });
    }
    refreshLedgerSchemeFilter();
}

const ledgerSearch = document.getElementById("ledger-search");
if (ledgerSearch) ledgerSearch.addEventListener("input", renderLedger);
document.addEventListener("DOMContentLoaded", initLedgerFilters);

// --- Filtro de cliente do Dashboard ---
let searchableDashboardScheme = null;
function refreshDashboardSchemeFilter() {
    if (!searchableDashboardScheme) return;
    const opts = [{ value: "all", label: "Todos os clientes" }].concat(
        scopedSchemes().map(s => ({ value: s.id, label: `${s.name} (${s.organization || 'Geral'})` }))
    );
    const cur = searchableDashboardScheme.getValue();
    searchableDashboardScheme.updateOptions(opts);
    // Se o cliente filtrado deixou de existir (excluído/fora do escopo), volta para "Todos"
    if (!opts.some(o => o.value === cur)) {
        searchableDashboardScheme.setValue("all");
        dashboardSchemeFilter = "all";
    }
}
function initDashboardFilter() {
    const c = document.getElementById("dashboard-scheme-filter-container");
    if (c && !searchableDashboardScheme) {
        searchableDashboardScheme = initSearchableSelect(c, [{ value: "all", label: "Todos os clientes" }], {
            inputId: "dashboard-scheme-filter", placeholder: "Todos os clientes", initialValue: "all",
            required: false,
            onSelect: (val) => {
                dashboardSchemeFilter = val || "all";
                if (typeof updateDashboard === "function") updateDashboard();
            }
        });
    }
    refreshDashboardSchemeFilter();
}
document.addEventListener("DOMContentLoaded", initDashboardFilter);

// ----------------------------------------------------
// 6. INICIALIZAÇÃO DO APP NA CARGA DA PÁGINA
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    loadState();
    setTodayDate();
    updateDashboard(); // Inicia com o Dashboard
    populateSchemeSelect(); // Inicializa selects de esquemas
});

// ----------------------------------------------------
// 7. SISTEMA DE CONVERSÃO SEGURA DE CAPITAIS
// ----------------------------------------------------

// Seletor de Formulários (Tabs) exposto globalmente
window.switchTxTab = function(tabName) {
    const tabAvulso = document.getElementById("tx-form-avulso-container");
    const tabConversao = document.getElementById("tx-form-conversao-container");
    const btnAvulso = document.getElementById("tab-btn-avulso");
    const btnConversao = document.getElementById("tab-btn-conversao");
    
    if (tabName === "avulso") {
        if (tabAvulso) tabAvulso.classList.remove("hidden");
        if (tabConversao) tabConversao.classList.add("hidden");
        if (btnAvulso) btnAvulso.classList.add("active");
        if (btnConversao) btnConversao.classList.remove("active");
    } else {
        if (tabAvulso) tabAvulso.classList.add("hidden");
        if (tabConversao) tabConversao.classList.remove("hidden");
        if (btnAvulso) btnAvulso.classList.remove("active");
        if (btnConversao) btnConversao.classList.add("active");
        
        // Popula selects e reseta a simulação ao entrar na aba
        populateConversionSelects();
        resetConversionForm();
    }
};

// Instâncias reativas globais dos seletores de Conversão
let searchableConvSourceOrg = null;
let searchableConvSource = null;
let searchableConvDestOrg = null;
let searchableConvDest = null;

// Popula os seletores de Clientes e Negócios para Origem e Destino na Conversão Segura
function populateConversionSelects() {
    const sourceOrgContainer = document.getElementById("conv-source-org-container");
    const sourceContainer = document.getElementById("conv-source-container");
    const destOrgContainer = document.getElementById("conv-dest-org-container");
    const destContainer = document.getElementById("conv-dest-container");

    if (!sourceOrgContainer || !sourceContainer || !destOrgContainer || !destContainer) return;

    // 1. Popula Clientes de Origem (Fachada)
    const fachadaSchemes = scopedSchemes().filter(s => s.type === "fachada" || !s.type);
    const sourceOrgs = [...new Set(fachadaSchemes.map(s => s.organization || "Geral"))];
    const sourceOrgOptions = sourceOrgs.map(org => ({ value: org, label: org.toUpperCase() }));

    const prevSourceOrgVal = searchableConvSourceOrg ? searchableConvSourceOrg.getValue() : "";
    const prevSourceVal = searchableConvSource ? searchableConvSource.getValue() : "";

    searchableConvSourceOrg = initSearchableSelect(sourceOrgContainer, sourceOrgOptions, {
        placeholder: "Selecione o cliente...",
        inputId: "conv-source-org",
        initialValue: sourceOrgs.includes(prevSourceOrgVal) ? prevSourceOrgVal : "",
        onSelect: (selectedOrg) => {
            const filtered = fachadaSchemes.filter(s => (s.organization || "Geral") === selectedOrg);
            const schemeOptions = filtered.map(s => ({ value: s.id, label: s.name }));

            searchableConvSource = initSearchableSelect(sourceContainer, schemeOptions, {
                placeholder: "Selecione o negócio...",
                inputId: "conv-source",
                onSelect: (val) => {
                    const input = document.getElementById("conv-source");
                    if (input) input.dispatchEvent(new Event("change"));
                }
            });

            const input = document.getElementById("conv-source");
            if (input) input.dispatchEvent(new Event("change"));
        }
    });

    if (prevSourceOrgVal && sourceOrgs.includes(prevSourceOrgVal)) {
        const filtered = fachadaSchemes.filter(s => (s.organization || "Geral") === prevSourceOrgVal);
        const schemeOptions = filtered.map(s => ({ value: s.id, label: s.name }));

        searchableConvSource = initSearchableSelect(sourceContainer, schemeOptions, {
            placeholder: "Selecione o negócio...",
            inputId: "conv-source",
            initialValue: filtered.some(s => s.id === prevSourceVal) ? prevSourceVal : "",
            onSelect: (val) => {
                const input = document.getElementById("conv-source");
                if (input) input.dispatchEvent(new Event("change"));
            }
        });
    } else {
        searchableConvSource = initSearchableSelect(sourceContainer, [], {
            placeholder: "Selecione o negócio...",
            inputId: "conv-source"
        });
    }

    // 2. Popula Clientes de Destino (Legítimo)
    const legalSchemes = scopedSchemes().filter(s => s.type === "legal");
    const destOrgs = [...new Set(legalSchemes.map(s => s.organization || "Geral"))];
    const destOrgOptions = destOrgs.map(org => ({ value: org, label: org.toUpperCase() }));

    const prevDestOrgVal = searchableConvDestOrg ? searchableConvDestOrg.getValue() : "";
    const prevDestVal = searchableConvDest ? searchableConvDest.getValue() : "";

    searchableConvDestOrg = initSearchableSelect(destOrgContainer, destOrgOptions, {
        placeholder: "Selecione o cliente...",
        inputId: "conv-dest-org",
        initialValue: destOrgs.includes(prevDestOrgVal) ? prevDestOrgVal : "",
        onSelect: (selectedOrg) => {
            const filtered = legalSchemes.filter(s => (s.organization || "Geral") === selectedOrg);
            const schemeOptions = filtered.map(s => ({ value: s.id, label: s.name }));

            searchableConvDest = initSearchableSelect(destContainer, schemeOptions, {
                placeholder: "Selecione o negócio...",
                inputId: "conv-dest",
                onSelect: (val) => {
                    const input = document.getElementById("conv-dest");
                    if (input) input.dispatchEvent(new Event("change"));
                }
            });

            const input = document.getElementById("conv-dest");
            if (input) input.dispatchEvent(new Event("change"));
        }
    });

    if (prevDestOrgVal && destOrgs.includes(prevDestOrgVal)) {
        const filtered = legalSchemes.filter(s => (s.organization || "Geral") === prevDestOrgVal);
        const schemeOptions = filtered.map(s => ({ value: s.id, label: s.name }));

        searchableConvDest = initSearchableSelect(destContainer, schemeOptions, {
            placeholder: "Selecione o negócio...",
            inputId: "conv-dest",
            initialValue: filtered.some(s => s.id === prevDestVal) ? prevDestVal : "",
            onSelect: (val) => {
                const input = document.getElementById("conv-dest");
                if (input) input.dispatchEvent(new Event("change"));
            }
        });
    } else {
        searchableConvDest = initSearchableSelect(destContainer, [], {
            placeholder: "Selecione o negócio...",
            inputId: "conv-dest"
        });
    }
}

// Reseta o formulário e pré-visualização de conversão
function resetConversionForm() {
    const formConv = document.getElementById("form-conversion");
    if (formConv) {
        formConv.reset();
    }
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById("conv-start-date");
    const endDateInput = document.getElementById("conv-end-date");
    if (startDateInput) startDateInput.value = today;
    if (endDateInput) endDateInput.value = today;
    
    // Reseta as instâncias dos searchable dropdowns
    if (searchableConvSourceOrg) searchableConvSourceOrg.reset();
    if (searchableConvSource) searchableConvSource.reset();
    if (searchableConvDestOrg) searchableConvDestOrg.reset();
    if (searchableConvDest) searchableConvDest.reset();

    // Limpa os inputs de taxa editável da conversão
    const sourceTaxInput = document.getElementById("conv-source-tax");
    const destTaxInput = document.getElementById("conv-dest-tax");
    if (sourceTaxInput) sourceTaxInput.value = "";
    if (destTaxInput) destTaxInput.value = "";

    updateConversionPreview();
}

// Atualiza o painel de simulação em tempo real com diluição
function updateConversionPreview() {
    const sourceId = document.getElementById("conv-source") ? document.getElementById("conv-source").value : "";
    const destId = document.getElementById("conv-dest") ? document.getElementById("conv-dest").value : "";
    const amountVal = parseMoneyValue("conv-amount");
    
    const startDateStr = document.getElementById("conv-start-date") ? document.getElementById("conv-start-date").value : "";
    const endDateStr = document.getElementById("conv-end-date") ? document.getElementById("conv-end-date").value : "";

    const sourceScheme = state.schemes.find(s => s.id === sourceId);
    const destScheme = state.schemes.find(s => s.id === destId);

    const bruto = isNaN(amountVal) ? 0 : amountVal;

    // Calcula diferença de dias
    let durationDays = 1;
    if (startDateStr && endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        if (end >= start) {
            const diffTime = Math.abs(end - start);
            durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }
    }
    
    const dailyBruto = bruto / durationDays;
    
    // 1. Taxa de lavagem da fachada (do input editável ou herdada do esquema)
    const sourceTaxEl = document.getElementById("conv-source-tax");
    const taxLavagemPct = (sourceTaxEl && sourceTaxEl.value !== "") ? parseFloat(sourceTaxEl.value) : (sourceScheme ? sourceScheme.tax : 0);
    const custoLavagem = bruto * (taxLavagemPct / 100);
    const lavadoLiquido = bruto - custoLavagem;

    // 2. Imposto sobre faturamento legal (do input editável ou herdado do esquema)
    const destTaxEl = document.getElementById("conv-dest-tax");
    const taxLegalPct = (destTaxEl && destTaxEl.value !== "") ? parseFloat(destTaxEl.value) : (destScheme ? destScheme.tax : 0);
    const custoLegal = lavadoLiquido * (taxLegalPct / 100);
    const consolidadoFinal = lavadoLiquido - custoLegal;

    // Atualiza elementos do preview no DOM
    const elBruto = document.getElementById("preview-bruto");
    const elDuration = document.getElementById("preview-duration");
    const elDailyAmount = document.getElementById("preview-daily-amount");
    const elTaxaLavagem = document.getElementById("preview-taxa-lavagem");
    const elLavadoLiquido = document.getElementById("preview-lavado-liquido");
    const elImpostoLegal = document.getElementById("preview-imposto-legal");
    const elConsolidado = document.getElementById("preview-consolidado-final");

    if (elBruto) elBruto.textContent = formatCurrency(bruto);
    if (elDuration) elDuration.textContent = `${durationDays} ${durationDays === 1 ? 'dia' : 'dias'}`;
    if (elDailyAmount) elDailyAmount.textContent = `${formatCurrency(dailyBruto)} / dia`;
    if (elTaxaLavagem) elTaxaLavagem.textContent = `- ${formatCurrency(custoLavagem)} (${taxLavagemPct.toFixed(1)}%)`;
    if (elLavadoLiquido) elLavadoLiquido.textContent = formatCurrency(lavadoLiquido);
    if (elImpostoLegal) elImpostoLegal.textContent = `- ${formatCurrency(custoLegal)} (${taxLegalPct.toFixed(1)}%)`;
    if (elConsolidado) elConsolidado.textContent = formatCurrency(consolidadoFinal);
}

// Inicializa os listeners de conversão na carga da página
document.addEventListener("DOMContentLoaded", () => {
    // Escuta alterações para atualizar o preview
    const convSource = document.getElementById("conv-source");
    const convDest = document.getElementById("conv-dest");
    const convAmount = document.getElementById("conv-amount");
    const convStartDate = document.getElementById("conv-start-date");
    const convEndDate = document.getElementById("conv-end-date");

    const convSourceOrg = document.getElementById("conv-source-org");
    const convDestOrg = document.getElementById("conv-dest-org");

    const convSourceTax = document.getElementById("conv-source-tax");
    const convDestTax = document.getElementById("conv-dest-tax");

    if (convSource) {
        convSource.addEventListener("change", () => {
            const scheme = state.schemes.find(s => s.id === convSource.value);
            if (convSourceTax) convSourceTax.value = scheme ? scheme.tax : "";
            updateConversionPreview();
        });
    }
    if (convDest) {
        convDest.addEventListener("change", () => {
            const scheme = state.schemes.find(s => s.id === convDest.value);
            if (convDestTax) convDestTax.value = scheme ? scheme.tax : "";
            updateConversionPreview();
        });
    }
    if (convSourceOrg) convSourceOrg.addEventListener("change", updateConversionPreview);
    if (convDestOrg) convDestOrg.addEventListener("change", updateConversionPreview);
    if (convAmount) {
        convAmount.addEventListener("input", () => {
            const amount = parseMoneyValue("conv-amount") || 0;
            if (convDestTax) {
                convDestTax.value = calculateProgressiveTax(amount);
            }
            updateConversionPreview();
        });
    }
    if (convSourceTax) convSourceTax.addEventListener("input", updateConversionPreview);
    if (convDestTax) convDestTax.addEventListener("input", updateConversionPreview);
    if (convStartDate) convStartDate.addEventListener("change", updateConversionPreview);
    if (convEndDate) convEndDate.addEventListener("change", updateConversionPreview);

    // Configura datas iniciais da conversão
    const today = new Date().toISOString().split('T')[0];
    if (convStartDate) convStartDate.value = today;
    if (convEndDate) convEndDate.value = today;

    // Submit da Conversão Segura
    const formConversion = document.getElementById("form-conversion");
    if (formConversion) {
        formConversion.addEventListener("submit", (e) => {
            e.preventDefault();

            const sourceId = document.getElementById("conv-source").value;
            const destId = document.getElementById("conv-dest").value;
            const amount = parseMoneyValue("conv-amount");
            const startDateStr = document.getElementById("conv-start-date").value;
            const endDateStr = document.getElementById("conv-end-date").value;
            const description = document.getElementById("conv-desc").value;
            const observation = document.getElementById("conv-obs") ? document.getElementById("conv-obs").value.trim() : "";

            const sourceScheme = state.schemes.find(s => s.id === sourceId);
            const destScheme = state.schemes.find(s => s.id === destId);

            if (!sourceScheme || !destScheme) {
                alert("Selecione canais válidos de origem e destino.");
                return;
            }

            if (isNaN(amount) || amount <= 0) {
                alert("Insira um valor de injeção válido.");
                return;
            }

            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);

            if (endDate < startDate) {
                alert("A data de término do período não pode ser anterior à data de início.");
                return;
            }

            // Calcula quantidade de dias do período de diluição
            const diffTime = Math.abs(endDate - startDate);
            const durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            const dailyAmount = parseFloat((amount / durationDays).toFixed(2));

            // Lê as taxas de origem e destino diretamente dos inputs editáveis da tela
            const inputSourceTax = document.getElementById("conv-source-tax");
            const inputDestTax = document.getElementById("conv-dest-tax");
            const taxSource = (inputSourceTax && inputSourceTax.value !== "") ? parseFloat(inputSourceTax.value) : sourceScheme.tax;
            const taxDest = (inputDestTax && inputDestTax.value !== "") ? parseFloat(inputDestTax.value) : destScheme.tax;

            // --- PROCESSAMENTO DA CONVERSÃO EM LOTE COM DILUIÇÃO TEMPORAL (PENDENTE DE CHECK) ---
            const days = [];
            for (let i = 0; i < durationDays; i++) {
                const currentDay = new Date(startDate);
                currentDay.setDate(startDate.getDate() + i);
                const currentDayStr = currentDay.toISOString().split('T')[0];

                days.push({
                    index: i + 1,
                    date: currentDayStr,
                    plannedAmount: dailyAmount,
                    actualAmount: dailyAmount, // inicia com o planejado
                    checked: false,
                    txIds: []
                });
            }

            // Cria e registra a Ordem de Conversão
            const conversionProcess = {
                id: "conv-" + Date.now(),
                sourceSchemeId: sourceId,
                destSchemeId: destId,
                amount: amount,
                taxSource: taxSource,
                taxDest: taxDest,
                startDate: startDateStr,
                endDate: endDateStr,
                durationDays: durationDays,
                description: description || "Fornecimento de Suprimentos",
                observation: observation,
                createdAt: new Date().toISOString(),
                days: days
            };
            
            state.conversions.push(conversionProcess);

            // Salva e atualiza tudo
            saveState();
            resetConversionForm();
            updateDashboard();
            alert(`Processo de conversão fracionado de ${durationDays} dias criado com sucesso! Acompanhe e confirme o envio diário na aba "Monitoramento".`);
        });
    }

    // Submit do Mover Organização
    const formMoveOrg = document.getElementById("form-move-org");
    if (formMoveOrg) {
        formMoveOrg.addEventListener("submit", (e) => {
            e.preventDefault();

            const schemeId = document.getElementById("move-org-scheme-id").value;
            const selectVal = document.getElementById("move-org-select").value;
            const newOrgVal = document.getElementById("move-org-new").value.trim();

            const scheme = state.schemes.find(s => s.id === schemeId);
            if (!scheme) {
                alert("Erro: Negócio inválido.");
                return;
            }

            // Define a organização de destino
            let targetOrg = selectVal;
            if (newOrgVal !== "") {
                targetOrg = newOrgVal;
            }

            if (!targetOrg) {
                alert("Por favor, selecione ou digite uma organização de destino.");
                return;
            }

            // Realiza a mudança de organização
            scheme.organization = targetOrg;
            saveState();

            // Fecha o modal e atualiza a interface reativamente
            window.closeMoveOrgModal();
            renderSchemes();
            renderLegalSchemes();
            populateSchemeSelect();
            populateConversionSelects();

            alert(`O negócio "${scheme.name}" foi movido com sucesso para a organização "${targetOrg.toUpperCase()}"!`);
        });
    }
});

// Instância global do seletor do modal de mudança
let searchableMoveOrg = null;

// Controle do modal de Mover Organização
window.openMoveOrgModal = function(schemeId, event) {
    if (event) event.stopPropagation(); // Evita expandir o accordion ao clicar no botão
    if (!requireEditData("Seu cargo não tem permissão para mover clientes de organização.")) return;

    const scheme = state.schemes.find(s => s.id === schemeId);
    if (!scheme) return;

    document.getElementById("move-org-scheme-id").value = schemeId;
    document.getElementById("move-org-new").value = "";
    
    // Atualiza o subtítulo com o nome do negócio
    const subtitle = document.getElementById("move-org-subtitle");
    if (subtitle) {
        subtitle.textContent = `Mover o negócio "${scheme.name}" para um grupo de destino diferente.`;
    }

    // Filtra organizações das mesmas categorias de esquema
    const orgs = [...new Set(scopedSchemes().map(s => s.organization || "Geral"))];
    const orgOptions = orgs.map(org => ({ value: org, label: org.toUpperCase() }));

    const container = document.getElementById("move-org-select-container");
    if (container) {
        searchableMoveOrg = initSearchableSelect(container, orgOptions, {
            placeholder: "Selecione um cliente existente...",
            inputId: "move-org-select",
            initialValue: (scheme.organization && orgs.includes(scheme.organization)) ? scheme.organization : "",
            required: false
        });
    }

    document.getElementById("modal-move-org").style.display = "flex";
};

window.closeMoveOrgModal = function() {
    document.getElementById("modal-move-org").style.display = "none";
    if (searchableMoveOrg) searchableMoveOrg.reset();
};

// Instâncias globais de categorias
let searchableSchemeCategory = null;
let searchableLegalSchemeCategory = null;

function initCategorySelects() {
    const catContainer = document.getElementById("scheme-category-container");
    const legalCatContainer = document.getElementById("legal-scheme-category-container");

    const catOptions = [
        { value: "Serviços Fictícios", label: "Serviços Fictícios (Consultoria/Palestras)" },
        { value: "Comércio de Fachada", label: "Comércio de Fachada (Restaurante/Lavanderia)" },
        { value: "Fracionamento", label: "Fracionamento (Smurfing/Depósitos)" },
        { value: "Aquisição de Ativos", label: "Aquisição de Ativos (Imóveis/Arte)" },
        { value: "Outro", label: "Outro Método Personalizado" }
    ];

    const legalCatOptions = [
        { value: "Serviços Reais", label: "Serviços Legítimos (Desenvolvimento/Consultoria)" },
        { value: "Comércio Legítimo", label: "Comércio Físico (Alimentos/Vestuário)" },
        { value: "Administradora de Ativos", label: "Holding / Administradora de Bens (Imóveis/Títulos)" },
        { value: "Outro", label: "Outra Categoria Comercial" }
    ];

    if (catContainer) {
        searchableSchemeCategory = initSearchableSelect(catContainer, catOptions, {
            placeholder: "Selecione o método...",
            inputId: "scheme-category",
            initialValue: "Serviços Fictícios"
        });
    }

    if (legalCatContainer) {
        searchableLegalSchemeCategory = initSearchableSelect(legalCatContainer, legalCatOptions, {
            placeholder: "Selecione o ramo...",
            inputId: "legal-scheme-category",
            initialValue: "Serviços Reais"
        });
    }
}

// Executa a inicialização de categorias comerciais ao carregar a página
document.addEventListener("DOMContentLoaded", initCategorySelects);

// Renderiza os lançamentos diretos que ainda estão em processamento (não consolidados)
window.renderProcessingLaunches = function() {
    const list = document.getElementById("processing-launches-list");
    if (!list) return;
    list.innerHTML = "";

    // Lançamentos diretos aguardando: status "Processando" ou "Pendente"
    const pending = scopedTransactions().filter(t => t.status === "Processando" || t.status === "Pendente");

    if (pending.length === 0) {
        list.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 30px; color: var(--text-muted); font-size: 12px;"><i class="fa-solid fa-circle-check"></i> Nenhum lançamento em processamento.</div>';
        return;
    }

    // Etapas legíveis
    const etapaLabels = {
        "Depósito": "1. Depósito",
        "Estratificação": "2. Estratificação",
        "Integração": "3. Integração"
    };

    pending.forEach(tx => {
        const scheme = state.schemes.find(s => s.id === tx.schemeId);
        const schemeName = scheme ? scheme.name : "Canal Inativo";
        const org = scheme ? (scheme.organization || "Geral") : "Geral";
        const statusLabel = tx.status === "Processando" ? "Em Processamento" : "Aguardando Envio";
        const statusClass = tx.status === "Processando" ? "active" : "pending";
        const etapa = etapaLabels[tx.type] || tx.type || "—";
        const formattedDate = tx.date ? tx.date.split('-').reverse().join('/') : "—";

        const card = document.createElement("div");
        card.className = "conversion-card";
        card.innerHTML = `
            <div class="conversion-card-header">
                <div>
                    <div class="conversion-card-title">${tx.description || 'Lançamento Direto'}</div>
                    <div class="conversion-card-subtitle">${etapa} · ${formattedDate}</div>
                </div>
                <span class="conversion-badge ${statusClass}">${statusLabel}</span>
            </div>

            <div class="conversion-flow-path">
                <div class="conversion-flow-node">
                    <span class="node-org">${org}</span>
                    <span class="node-name" title="${schemeName}">${schemeName.length > 24 ? schemeName.substring(0, 22) + '...' : schemeName}</span>
                </div>
            </div>

            <div class="conversion-details-grid">
                <div class="conversion-detail-item">
                    <span class="conversion-detail-label">Valor</span>
                    <span class="conversion-detail-value">${formatCurrency(tx.amount || 0)}</span>
                </div>
                <div class="conversion-detail-item" style="text-align: right;">
                    <span class="conversion-detail-label">Líquido</span>
                    <span class="conversion-detail-value" style="color: var(--primary);">${formatCurrency(tx.netAmount || 0)}</span>
                </div>
            </div>

            ${canConfirmOps() ? `
            <button class="btn-day-check" data-conclude="${tx.id}" style="width: 100%; justify-content: center; margin-top: 12px;">
                <i class="fa-solid fa-check"></i> Marcar como Concluído
            </button>
            ` : `
            <div style="text-align: center; margin-top: 12px; font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-lock"></i> Sem permissão para concluir</div>
            `}
        `;
        list.appendChild(card);
    });

    // Liga os botões de conclusão
    list.querySelectorAll("[data-conclude]").forEach(btn => {
        btn.addEventListener("click", () => window.concludeLaunch(btn.getAttribute("data-conclude")));
    });
};

// Renderiza o histórico dos lançamentos diretos que foram concluídos (só visualização)
window.renderProcessedLaunches = function() {
    const list = document.getElementById("processed-launches-list");
    if (!list) return;
    list.innerHTML = "";

    // Somente lançamentos que passaram pelo processamento e foram concluídos
    const done = scopedTransactions().filter(t => t.concludedAt);
    done.sort((a, b) => String(b.concludedAt).localeCompare(String(a.concludedAt)));

    if (done.length === 0) {
        list.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 30px; color: var(--text-muted); font-size: 12px;"><i class="fa-solid fa-clock-rotate-left"></i> Nenhum lançamento concluído ainda.</div>';
        return;
    }

    const etapaLabels = {
        "Depósito": "1. Depósito",
        "Estratificação": "2. Estratificação",
        "Integração": "3. Integração"
    };

    done.forEach(tx => {
        const scheme = state.schemes.find(s => s.id === tx.schemeId);
        const schemeName = scheme ? scheme.name : "Canal Inativo";
        const org = scheme ? (scheme.organization || "Geral") : "Geral";
        const etapa = etapaLabels[tx.type] || tx.type || "—";
        let concludedLabel = "—";
        try { concludedLabel = new Date(tx.concludedAt).toLocaleDateString("pt-BR"); } catch (_) {}

        const card = document.createElement("div");
        card.className = "conversion-card";
        card.innerHTML = `
            <div class="conversion-card-header">
                <div>
                    <div class="conversion-card-title">${tx.description || 'Lançamento Direto'}</div>
                    <div class="conversion-card-subtitle">${etapa} · Concluído em ${concludedLabel}</div>
                </div>
                <span class="conversion-badge completed">Concluído</span>
            </div>

            <div class="conversion-flow-path">
                <div class="conversion-flow-node">
                    <span class="node-org">${org}</span>
                    <span class="node-name" title="${schemeName}">${schemeName.length > 24 ? schemeName.substring(0, 22) + '...' : schemeName}</span>
                </div>
            </div>

            <div class="conversion-details-grid">
                <div class="conversion-detail-item">
                    <span class="conversion-detail-label">Valor</span>
                    <span class="conversion-detail-value">${formatCurrency(tx.amount || 0)}</span>
                </div>
                <div class="conversion-detail-item" style="text-align: right;">
                    <span class="conversion-detail-label">Líquido</span>
                    <span class="conversion-detail-value" style="color: var(--color-success);">${formatCurrency(tx.netAmount || 0)}</span>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
};

// Marca um lançamento direto como concluído (Consolidado / Limpo)
window.concludeLaunch = function(txId) {
    const tx = (state.transactions || []).find(t => t.id === txId);
    if (!tx) return;
    tx.status = "Limpo";
    tx.concludedAt = new Date().toISOString(); // registra a conclusão para o histórico
    saveState();
    renderProcessingLaunches();
    if (window.renderProcessedLaunches) window.renderProcessedLaunches();
    if (typeof renderLedger === "function") renderLedger();
    if (typeof updateDashboard === "function") updateDashboard();
};

// Renderiza os processos de conversão/lavagem ativos e concluídos
window.renderConversions = function() {
    // Sempre atualiza os painéis de lançamentos diretos (em processamento + histórico)
    window.renderProcessingLaunches();
    if (window.renderProcessedLaunches) window.renderProcessedLaunches();

    const activeList = document.getElementById("active-conversions-list");
    const completedList = document.getElementById("completed-conversions-list");

    if (!activeList || !completedList) return;

    activeList.innerHTML = "";
    completedList.innerHTML = "";

    const conversions = scopedConversions();

    if (conversions.length === 0) {
        const emptyMsg = '<div style="grid-column: span 3; text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">Nenhuma operação de lavagem registrada.</div>';
        activeList.innerHTML = emptyMsg;
        completedList.innerHTML = emptyMsg;
        return;
    }

    let activeCount = 0;
    let completedCount = 0;

    conversions.forEach(conv => {
        const sourceScheme = state.schemes.find(s => s.id === conv.sourceSchemeId);
        const destScheme = state.schemes.find(s => s.id === conv.destSchemeId);

        const sourceName = sourceScheme ? sourceScheme.name : "Canal Inativo";
        const sourceOrg = sourceScheme ? (sourceScheme.organization || "Geral") : "Geral";
        const destName = destScheme ? destScheme.name : "Canal Inativo";
        const destOrg = destScheme ? (destScheme.organization || "Geral") : "Geral";

        // Calcula comissões e líquido estimado real (usando actualAmount para dias checked, plannedAmount para unchecked)
        let totalSujeito = 0;
        let totalLiquido = 0;

        const taxSource = conv.taxSource || 0;
        const taxDest = conv.taxDest || 0;

        if (conv.days && conv.days.length > 0) {
            conv.days.forEach(day => {
                const dayAmt = day.checked ? day.actualAmount : day.plannedAmount;
                totalSujeito += dayAmt;
                
                const costS = dayAmt * (taxSource / 100);
                const costD = (dayAmt - costS) * (taxDest / 100);
                totalLiquido += (dayAmt - costS - costD);
            });
        } else {
            totalSujeito = conv.amount;
            const costS = conv.amount * (taxSource / 100);
            const costD = (conv.amount - costS) * (taxDest / 100);
            totalLiquido = conv.amount - costS - costD;
        }

        // Progresso com base nas parcelas confirmadas (check)
        const totalDays = conv.days ? conv.days.length : conv.durationDays;
        const checkedDays = conv.days ? conv.days.filter(d => d.checked).length : 0;
        const progressPct = totalDays > 0 ? Math.floor((checkedDays / totalDays) * 100) : 0;

        let status = "pending";
        let statusLabel = "A iniciar";

        if (progressPct === 100) {
            status = "completed";
            statusLabel = "Concluído";
        } else if (progressPct > 0) {
            status = "active";
            statusLabel = "Em Andamento";
        } else {
            status = "pending";
            statusLabel = "Pendente";
        }

        const progressText = progressPct === 100 ? "Finalizado" : `Dia ${checkedDays} de ${totalDays}`;

        // Indicador: algum dia foi enviado abaixo do planejado (valor faltante pendente)?
        const hasShortfall = (conv.days || []).some(d => d.checked && (((d.plannedAmount || 0) - (d.actualAmount || 0)) > 0.01));
        const shortfallBadge = hasShortfall
            ? `<span class="conversion-badge shortfall" title="Há dia(s) enviado(s) abaixo do planejado"><i class="fa-solid fa-triangle-exclamation"></i> Faltante</span>`
            : "";

        const card = document.createElement("div");
        card.className = "conversion-card" + (hasShortfall ? " has-shortfall" : "");
        card.addEventListener("click", () => window.openMonitorDetails(conv.id));

        const formattedStart = conv.startDate.split('-').reverse().join('/');
        const formattedEnd = conv.endDate.split('-').reverse().join('/');

        card.innerHTML = `
            <div class="conversion-card-header">
                <div>
                    <div class="conversion-card-title">${conv.description || 'Operação de Lavagem'}</div>
                    <div class="conversion-card-subtitle">Criado em: ${new Date(conv.createdAt).toLocaleDateString('pt-BR')}</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                    <span class="conversion-badge ${status}">${statusLabel}</span>
                    ${shortfallBadge}
                </div>
            </div>
            
            <div class="conversion-flow-path">
                <div class="conversion-flow-node">
                    <span class="node-org">${sourceOrg}</span>
                    <span class="node-name" title="${sourceName}">${sourceName.length > 22 ? sourceName.substring(0, 20) + '...' : sourceName}</span>
                </div>
                <div class="conversion-flow-arrow">
                    <i class="fa-solid fa-arrow-right-long text-primary"></i>
                </div>
                <div class="conversion-flow-node" style="text-align: right;">
                    <span class="node-org">${destOrg}</span>
                    <span class="node-name" title="${destName}">${destName.length > 22 ? destName.substring(0, 20) + '...' : destName}</span>
                </div>
            </div>

            <div class="conversion-details-grid">
                <div class="conversion-detail-item">
                    <span class="conversion-detail-label">Valor Total</span>
                    <span class="conversion-detail-value">${formatCurrency(totalSujeito)}</span>
                </div>
                <div class="conversion-detail-item" style="text-align: right;">
                    <span class="conversion-detail-label">Líquido Total</span>
                    <span class="conversion-detail-value" style="color: var(--primary);">${formatCurrency(totalLiquido)}</span>
                </div>
            </div>

            <div class="conversion-details-grid" style="border-top: 1px dashed rgba(255,255,255,0.04); padding-top: 10px; margin-top: 0;">
                <div class="conversion-detail-item">
                    <span class="conversion-detail-label">Início</span>
                    <span class="conversion-detail-value" style="font-size: 11px; font-weight: 500;">${formattedStart}</span>
                </div>
                <div class="conversion-detail-item" style="text-align: right;">
                    <span class="conversion-detail-label">Término</span>
                    <span class="conversion-detail-value" style="font-size: 11px; font-weight: 500;">${formattedEnd}</span>
                </div>
            </div>

            <div class="conversion-progress-area">
                <div class="conversion-progress-info">
                    <span class="conversion-progress-text">${progressText}</span>
                    <span class="conversion-progress-pct">${progressPct}%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill ${status}" style="width: ${progressPct}%;"></div>
                </div>
            </div>
        `;

        if (status === "completed") {
            completedList.appendChild(card);
            completedCount++;
        } else {
            activeList.appendChild(card);
            activeCount++;
        }
    });

    if (activeCount === 0) {
        activeList.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 30px; color: var(--text-muted); font-size: 12px;"><i class="fa-solid fa-hourglass-empty"></i> Nenhuma operação de lavagem ativa no momento.</div>';
    }

    if (completedCount === 0) {
        completedList.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 30px; color: var(--text-muted); font-size: 12px;"><i class="fa-solid fa-history"></i> Nenhum histórico registrado.</div>';
    }
};

// Funções da Modal de Detalhes do Monitoramento
window.openMonitorDetails = function(convId) {
    const conv = state.conversions.find(c => c.id === convId);
    if (!conv) return;

    // Garantia defensiva extra caso a conversão seja legada e days não exista
    if (!conv.days || !Array.isArray(conv.days)) {
        const totalDays = conv.durationDays || 1;
        const dailyAmount = parseFloat((conv.amount / totalDays).toFixed(2));
        conv.days = [];
        for (let i = 0; i < totalDays; i++) {
            const currentDay = new Date(conv.startDate);
            currentDay.setDate(currentDay.getDate() + i);
            const currentDayStr = currentDay.toISOString().split('T')[0];

            conv.days.push({
                index: i + 1,
                date: currentDayStr,
                plannedAmount: dailyAmount,
                actualAmount: dailyAmount,
                checked: false,
                txIds: []
            });
        }
        saveState();
    }

    const sourceScheme = state.schemes.find(s => s.id === conv.sourceSchemeId);
    const destScheme = state.schemes.find(s => s.id === conv.destSchemeId);

    const sourceName = sourceScheme ? sourceScheme.name : "Canal Inativo";
    const destName = destScheme ? destScheme.name : "Canal Inativo";

    document.getElementById("monitor-details-desc").textContent = conv.description || "Operação de Lavagem";

    // Observação da operação (opcional)
    const obsWrapper = document.getElementById("monitor-details-obs-wrapper");
    const obsSpan = document.getElementById("monitor-details-obs");
    if (obsWrapper && obsSpan) {
        if (conv.observation) {
            obsSpan.textContent = conv.observation;
            obsWrapper.style.display = "block";
        } else {
            obsWrapper.style.display = "none";
        }
    }
    
    // Status badge
    const totalDays = conv.days ? conv.days.length : conv.durationDays;
    const checkedDays = conv.days ? conv.days.filter(d => d.checked).length : 0;
    const progressPct = totalDays > 0 ? Math.floor((checkedDays / totalDays) * 100) : 0;

    const badge = document.getElementById("monitor-details-badge");
    if (badge) {
        badge.className = "conversion-badge";
        if (progressPct === 100) {
            badge.classList.add("completed");
            badge.textContent = "Concluído";
        } else if (progressPct > 0) {
            badge.classList.add("active");
            badge.textContent = "Em Andamento";
        } else {
            badge.classList.add("pending");
            badge.textContent = "Pendente";
        }
    }

    document.getElementById("monitor-details-source").textContent = `${sourceScheme ? sourceScheme.organization.toUpperCase() : 'GERAL'} - ${sourceName}`;
    document.getElementById("monitor-details-dest").textContent = `${destScheme ? destScheme.organization.toUpperCase() : 'GERAL'} - ${destName}`;

    // Calcula comissões e líquido estimado
    let totalSujeito = 0;
    let totalLiquido = 0;
    const taxSource = conv.taxSource || 0;
    const taxDest = conv.taxDest || 0;

    if (conv.days && conv.days.length > 0) {
        conv.days.forEach(day => {
            const dayAmt = day.checked ? day.actualAmount : day.plannedAmount;
            totalSujeito += dayAmt;
            
            const costS = dayAmt * (taxSource / 100);
            const costD = (dayAmt - costS) * (taxDest / 100);
            totalLiquido += (dayAmt - costS - costD);
        });
    }

    document.getElementById("monitor-details-amount").textContent = formatCurrency(totalSujeito);
    document.getElementById("monitor-details-net").textContent = formatCurrency(totalLiquido);

    // Renderiza a lista de dias
    const daysList = document.getElementById("monitor-days-list");
    if (daysList) {
        daysList.innerHTML = "";

        conv.days.forEach((day, index) => {
            const row = document.createElement("div");
            row.className = `monitor-day-row${day.checked ? ' checked' : ''}`;

            const formattedDate = day.date.split('-').reverse().join('/');

            // Diferença entre o planejado e o que foi realmente enviado
            const planned = day.plannedAmount || 0;
            const shortfall = day.checked ? (planned - (day.actualAmount || 0)) : 0;

            let shortfallHtml = "";
            if (shortfall > 0.01) {
                const missingBtn = canConfirmOps()
                    ? `<button class="btn-day-missing" onclick="window.sendMissingConversionDay('${conv.id}', ${index})"><i class="fa-solid fa-rotate-right"></i> Enviar faltante</button>`
                    : "";
                shortfallHtml = `
                    <div class="monitor-day-shortfall">
                        <span><i class="fa-solid fa-triangle-exclamation"></i> Faltam ${formatCurrency(shortfall)} do planejado (${formatCurrency(planned)})</span>
                        ${missingBtn}
                    </div>
                `;
            } else if (day.compensated) {
                shortfallHtml = `
                    <div class="monitor-day-shortfall compensated">
                        <span><i class="fa-solid fa-circle-check"></i> Valor faltante compensado — bate com o planejado</span>
                    </div>
                `;
            }

            row.innerHTML = `
                <div class="monitor-day-info">
                    <span class="monitor-day-title">Dia ${day.index} - Diluição</span>
                    <span class="monitor-day-date">${formattedDate}</span>
                </div>
                <div class="monitor-day-actions">
                    <div class="monitor-day-input-wrapper">
                        <span class="monitor-day-input-prefix">R$</span>
                        <input type="text" class="monitor-day-input"
                            id="input-day-val-${conv.id}-${index}"
                            value="${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(day.actualAmount)}"
                            oninput="window.maskMoney(this)"
                            ${(day.checked || !canEditDataPerm()) ? 'disabled' : ''}
                            ${!canEditDataPerm() ? 'title="Seu cargo não tem permissão para alterar valores de uma operação"' : ''}>
                    </div>
                    ${day.checked ? `
                        <span class="monitor-checked-text">
                            <i class="fa-solid fa-circle-check"></i> Enviado
                        </span>
                    ` : (canConfirmOps() ? `
                        <button class="btn-day-check" onclick="window.confirmConversionDay('${conv.id}', ${index})">
                            <i class="fa-solid fa-check"></i> Check
                        </button>
                    ` : `
                        <span class="monitor-checked-text" style="color: var(--text-muted);">
                            <i class="fa-solid fa-lock"></i> Sem permissão
                        </span>
                    `)}
                </div>
                ${shortfallHtml}
            `;
            daysList.appendChild(row);
        });
    }

    const modal = document.getElementById("modal-monitor-details");
    if (modal) modal.style.display = "flex";
};

window.closeMonitorDetails = function() {
    const modal = document.getElementById("modal-monitor-details");
    if (modal) modal.style.display = "none";
};

// Cria o par de lançamentos (origem/destino) de uma injeção de conversão e retorna [idOrig, idDest]
function pushConversionTxPair(conv, day, dayIndex, amount, kindLabel, idSuffix) {
    // Funciona mesmo com canais inativos/removidos: usa os ids e taxas salvos na operação.
    const sourceScheme = state.schemes.find(s => s.id === conv.sourceSchemeId);
    const destScheme = state.schemes.find(s => s.id === conv.destSchemeId);
    const sourceName = sourceScheme ? sourceScheme.name : "Canal Inativo";
    const destName = destScheme ? destScheme.name : "Canal Inativo";

    let lastHash = getLatestHash();
    const periodLabel = `[Dia ${day.index}/${conv.days.length} - ${kindLabel} em: ${new Date().toLocaleDateString('pt-BR')}]`;
    const txUser = currentTxUser();
    const txTime = new Date().toISOString();

    // 1. Débito de Integração na Fachada (Origem)
    const costOrig = amount * (conv.taxSource / 100);
    const netOrig = amount - costOrig;
    const txOrig = {
        id: `tx-${Date.now()}-${dayIndex}${idSuffix}-a`,
        schemeId: conv.sourceSchemeId,
        amount: amount,
        date: day.date,
        type: "Integração",
        status: "Limpo",
        description: `[CONVERSÃO REAL] ${periodLabel} Lucros para ${destName} - ${conv.description}`,
        cost: costOrig,
        netAmount: netOrig,
        stockItemId: "",
        stockQty: null,
        createdBy: txUser,
        createdAt: txTime
    };
    txOrig.hash = generateHash(txOrig, lastHash);
    state.transactions.push(txOrig);
    lastHash = txOrig.hash;

    // 2. Crédito de Faturamento no Canal Legítimo (Destino)
    const costDest = netOrig * (conv.taxDest / 100);
    const netDest = netOrig - costDest;
    const txDest = {
        id: `tx-${Date.now()}-${dayIndex}${idSuffix}-b`,
        schemeId: conv.destSchemeId,
        amount: netOrig,
        date: day.date,
        type: "Integração",
        status: "Limpo",
        description: `[CONVERSÃO REAL] ${periodLabel} Aporte de Capital de ${sourceName} - ${conv.description}`,
        cost: costDest,
        netAmount: netDest,
        stockItemId: "",
        stockQty: null,
        createdBy: txUser,
        createdAt: txTime
    };
    txDest.hash = generateHash(txDest, lastHash);
    state.transactions.push(txDest);

    return [txOrig.id, txDest.id];
}

window.confirmConversionDay = function(convId, dayIndex) {
    const conv = state.conversions.find(c => c.id === convId);
    if (!conv) return;

    const day = conv.days[dayIndex];
    if (!day || day.checked) return;

    // Pega o valor real enviado do input correspondente
    const inputEl = document.getElementById(`input-day-val-${convId}-${dayIndex}`);
    const actualAmount = inputEl ? parseMoneyValue(inputEl) : day.plannedAmount;

    if (isNaN(actualAmount) || actualAmount <= 0) {
        alert("Por favor, insira um valor enviado válido.");
        return;
    }

    // Marca como check (funciona mesmo com canais inativos)
    day.actualAmount = actualAmount;
    day.checked = true;

    // Gera os lançamentos reais no Livro-Razão
    day.txIds = pushConversionTxPair(conv, day, dayIndex, actualAmount, "Confirmado", "") || [];

    saveState();
    updateDashboard();
    renderConversions();
    openMonitorDetails(convId); // Recarrega a modal para exibir o status atualizado

    alert(`Sucesso! Parcela do Dia ${day.index} confirmada no valor de R$ ${actualAmount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}. Lançamentos gerados no Livro-Razão.`);
};

// Redundância: envia o valor FALTANTE de um dia que foi enviado abaixo do planejado
window.sendMissingConversionDay = function(convId, dayIndex) {
    const conv = state.conversions.find(c => c.id === convId);
    if (!conv) return;

    const day = conv.days[dayIndex];
    if (!day || !day.checked) return;

    const missing = (day.plannedAmount || 0) - (day.actualAmount || 0);
    if (missing <= 0.01) return; // já bate com o planejado

    // Funciona mesmo com canais inativos (usa ids/taxas salvos na operação)
    const ids = pushConversionTxPair(conv, day, dayIndex, missing, "Compensação", "-comp");
    if (!ids) return;

    // Agora o dia bate com o planejado
    day.actualAmount = day.plannedAmount;
    day.compensated = true;
    if (!Array.isArray(day.txIds)) day.txIds = [];
    day.txIds.push(ids[0], ids[1]);

    saveState();
    // Refresh do modal primeiro (feedback visual garantido); demais telas de forma blindada
    openMonitorDetails(convId);
    try { updateDashboard(); } catch (e) {}
    try { renderConversions(); } catch (e) {}
};
