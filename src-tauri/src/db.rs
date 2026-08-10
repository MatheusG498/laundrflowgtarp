// Módulo de banco de dados: MongoDB Atlas (online) + espelho JSON local (offline).
//
// Modelo de dados: o estado inteiro do app é salvo como UM documento
// { _id: "laundrflow_state", schemes, transactions, conversions, updatedAt }
// na coleção `state`. Isso casa com o modelo de localStorage já usado no front.

use mongodb::bson::{doc, Document};
use mongodb::options::{ClientOptions, ReplaceOptions, ServerApi, ServerApiVersion};
use mongodb::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::time::Duration;
use tauri::AppHandle;

const STATE_ID: &str = "laundrflow_state";
const COLLECTION: &str = "state";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DbConfig {
    #[serde(default)]
    pub uri: String,
    #[serde(default = "default_db_name", rename = "dbName")]
    pub db_name: String,
}

fn default_db_name() -> String {
    "laundrflow".to_string()
}

// ---------- Caminhos de arquivo ----------

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path_resolver()
        .app_config_dir()
        .ok_or_else(|| "Não foi possível resolver o diretório de dados do app.".to_string())?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Erro ao criar diretório: {e}"))?;
    }
    Ok(dir)
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("db_config.json"))
}

fn local_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("local_data.json"))
}

// ---------- Config ----------

fn read_config(app: &AppHandle) -> DbConfig {
    match config_path(app).and_then(|p| std::fs::read_to_string(p).map_err(|e| e.to_string())) {
        Ok(txt) => serde_json::from_str(&txt).unwrap_or_default(),
        Err(_) => DbConfig::default(),
    }
}

// ---------- Conexão Mongo ----------

async fn connect(uri: &str, db_name: &str) -> Result<mongodb::Database, String> {
    if uri.trim().is_empty() {
        return Err("Connection string vazia. Configure o Mongo Atlas primeiro.".to_string());
    }
    let mut opts = ClientOptions::parse(uri)
        .await
        .map_err(|e| format!("URI inválida: {e}"))?;
    // API estável do servidor (recomendado pelo Atlas) + timeout curto para não travar o app.
    opts.server_api = Some(ServerApi::builder().version(ServerApiVersion::V1).build());
    opts.server_selection_timeout = Some(Duration::from_secs(8));
    opts.connect_timeout = Some(Duration::from_secs(8));
    let client = Client::with_options(opts).map_err(|e| format!("Erro ao criar cliente: {e}"))?;
    Ok(client.database(db_name))
}

// ---------- Comandos Tauri ----------

/// Retorna a config salva (uri + dbName) e se já está configurada.
#[tauri::command]
pub fn db_get_config(app: AppHandle) -> Value {
    let cfg = read_config(&app);
    serde_json::json!({
        "uri": cfg.uri,
        "dbName": cfg.db_name,
        "configured": !cfg.uri.trim().is_empty(),
    })
}

/// Salva a config no disco.
#[tauri::command]
pub fn db_save_config(app: AppHandle, uri: String, db_name: String) -> Result<Value, String> {
    let db_name = if db_name.trim().is_empty() {
        default_db_name()
    } else {
        db_name.trim().to_string()
    };
    let cfg = DbConfig {
        uri: uri.trim().to_string(),
        db_name,
    };
    let txt = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(config_path(&app)?, txt).map_err(|e| format!("Erro ao salvar config: {e}"))?;
    Ok(serde_json::json!({ "ok": true, "message": "Configuração salva." }))
}

/// Testa a conexão com o Atlas usando a URI informada (ou a salva, se vazia).
#[tauri::command]
pub async fn db_test_connection(app: AppHandle, uri: String, db_name: String) -> Value {
    let cfg = read_config(&app);
    let uri = if uri.trim().is_empty() { cfg.uri } else { uri };
    let db_name = if db_name.trim().is_empty() {
        cfg.db_name
    } else {
        db_name
    };

    match connect(&uri, &db_name).await {
        Ok(db) => match db.run_command(doc! { "ping": 1 }, None).await {
            Ok(_) => serde_json::json!({ "ok": true, "message": "Conexão bem-sucedida com o Atlas." }),
            Err(e) => serde_json::json!({ "ok": false, "message": format!("Falha no ping: {e}") }),
        },
        Err(e) => serde_json::json!({ "ok": false, "message": e }),
    }
}

/// Salva o estado APENAS no espelho local (offline). Sempre chamado pelo front.
#[tauri::command]
pub fn local_save(app: AppHandle, state: Value) -> Result<Value, String> {
    let txt = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(local_data_path(&app)?, txt)
        .map_err(|e| format!("Erro ao salvar dados locais: {e}"))?;
    Ok(serde_json::json!({ "ok": true }))
}

/// Carrega o estado do espelho local. Retorna null se não existir.
#[tauri::command]
pub fn local_load(app: AppHandle) -> Value {
    match local_data_path(&app).and_then(|p| std::fs::read_to_string(p).map_err(|e| e.to_string())) {
        Ok(txt) => serde_json::from_str(&txt).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

/// Envia (upsert) o estado inteiro para o Atlas. Também atualiza o espelho local.
#[tauri::command]
pub async fn db_push(app: AppHandle, state: Value) -> Value {
    // Sempre grava local primeiro (garante persistência mesmo se o Atlas falhar).
    if let Err(e) = local_save(app.clone(), state.clone()) {
        return serde_json::json!({ "ok": false, "message": e });
    }

    let cfg = read_config(&app);
    let db = match connect(&cfg.uri, &cfg.db_name).await {
        Ok(db) => db,
        Err(e) => return serde_json::json!({ "ok": false, "offline": true, "message": e }),
    };

    // Monta o documento a partir do estado + _id + updatedAt.
    let mut object = match state.as_object().cloned() {
        Some(o) => o,
        None => serde_json::Map::new(),
    };
    object.insert("_id".to_string(), Value::String(STATE_ID.to_string()));
    object.insert(
        "updatedAt".to_string(),
        Value::String(chrono::Utc::now().to_rfc3339()),
    );
    let value = Value::Object(object);

    let document: Document = match mongodb::bson::to_document(&value) {
        Ok(d) => d,
        Err(e) => {
            return serde_json::json!({ "ok": false, "message": format!("Erro ao converter dados: {e}") })
        }
    };

    let coll = db.collection::<Document>(COLLECTION);
    let opts = ReplaceOptions::builder().upsert(true).build();
    match coll
        .replace_one(doc! { "_id": STATE_ID }, document, opts)
        .await
    {
        Ok(_) => serde_json::json!({ "ok": true, "message": "Sincronizado com o Atlas." }),
        Err(e) => {
            serde_json::json!({ "ok": false, "offline": true, "message": format!("Falha ao enviar: {e}") })
        }
    }
}

/// Puxa o estado inteiro do Atlas. Retorna { ok, state, message }.
#[tauri::command]
pub async fn db_pull(app: AppHandle) -> Value {
    let cfg = read_config(&app);
    let db = match connect(&cfg.uri, &cfg.db_name).await {
        Ok(db) => db,
        Err(e) => return serde_json::json!({ "ok": false, "offline": true, "message": e }),
    };

    let coll = db.collection::<Document>(COLLECTION);
    match coll.find_one(doc! { "_id": STATE_ID }, None).await {
        Ok(Some(document)) => {
            let mut value: Value =
                serde_json::to_value(&document).unwrap_or(Value::Null);
            // Remove campos internos do Mongo antes de devolver ao front.
            if let Some(obj) = value.as_object_mut() {
                obj.remove("_id");
            }
            // Atualiza espelho local com o que veio da nuvem.
            let _ = local_save(app.clone(), value.clone());
            serde_json::json!({ "ok": true, "state": value, "message": "Dados carregados do Atlas." })
        }
        Ok(None) => {
            serde_json::json!({ "ok": true, "state": Value::Null, "message": "Nenhum dado no Atlas ainda." })
        }
        Err(e) => {
            serde_json::json!({ "ok": false, "offline": true, "message": format!("Falha ao puxar: {e}") })
        }
    }
}
