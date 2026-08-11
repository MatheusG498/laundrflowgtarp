# Atualização automática (updater via GitHub)

O app verifica atualizações nos **Releases do GitHub**. Quando há uma nova versão,
mostra um aviso no estilo do app com as novidades, instala em segundo plano e reabre.

## Como funciona (peças)

- **`src-tauri/tauri.conf.json`** → `updater` ativo, apontando para
  `releases/latest/download/latest.json`, com a chave pública de verificação.
- **`ui/updater.js` + modal no `index.html`** → o aviso customizado, instalação e relaunch.
- **`.github/workflows/release.yml`** → builda e publica o release (assinado) quando você envia uma tag `v*`.
- **`.tauri-key` / `.tauri-key.pub`** → par de chaves de assinatura (a privada NUNCA vai pro Git).

## Configuração única (fazer uma vez)

1. **Adicionar os segredos no GitHub** (repositório → Settings → Secrets and variables → Actions → New repository secret):
   - `TAURI_PRIVATE_KEY` → o **conteúdo** do arquivo `.tauri-key` (abra e copie tudo).
   - `TAURI_KEY_PASSWORD` → a senha da chave: `LaundrFlow#Upd8-2026`
   > Guarde a chave privada e a senha em lugar seguro. Se perdê-las, não dá para assinar novas atualizações.

2. **Distribuir uma base com o updater**: o instalador atual (0.1.0) foi gerado **antes** do updater,
   então ele NÃO se atualiza sozinho. Gere e distribua uma versão nova com o updater embutido
   (ex.: 0.1.1) — a partir dela, todas as próximas se atualizam sozinhas.

## Lançar uma atualização (o dia a dia)

1. Faça as mudanças no código.
2. **Suba a versão** em `src-tauri/tauri.conf.json` → `package.version` (ex.: `0.1.1` → `0.2.0`).
3. Commit e push na `main`.
4. Crie uma **tag anotada** cuja mensagem é o changelog (aparece no aviso do app):
   ```bash
   git tag -a v0.2.0 -m "- Filtro por organização
   - Editar cargos
   - Envio de valor faltante"
   git push origin v0.2.0
   ```
5. O GitHub Actions builda, assina e publica o release automaticamente (aba **Actions** mostra o progresso).
6. Os apps instalados detectam a nova versão em segundos e mostram o aviso.

> A **versão da tag** (`v0.2.0`) deve bater com o `package.version` do `tauri.conf.json`.

## Testar

- Publique um release com versão maior que a instalada.
- Abra o app: em ~4s ele verifica e, se houver atualização, mostra o modal com as novidades.
- "Atualizar e reiniciar" → baixa, instala em modo *passive* (barra de progresso, sem interação) e reabre.
