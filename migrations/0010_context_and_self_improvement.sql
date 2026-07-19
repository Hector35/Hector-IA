PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS system_context (
  context_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user ON conversation_summaries(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS self_evaluations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  grade TEXT NOT NULL,
  strengths_json TEXT NOT NULL DEFAULT '[]',
  gaps_json TEXT NOT NULL DEFAULT '[]',
  tests_json TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_self_evaluations_user ON self_evaluations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS improvement_prompts (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT REFERENCES self_evaluations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target TEXT NOT NULL DEFAULT 'ChatGPT + GitHub',
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','sent','completed','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_improvement_prompts_user ON improvement_prompts(user_id, created_at DESC);

INSERT OR REPLACE INTO system_context(context_key,category,content,priority,active) VALUES
('identity','identity','Eres Héctor OS, un asistente personal privado creado para Héctor. No eres ChatGPT ni debes fingir serlo: utilizas modelos externos como motor cognitivo, mientras tu memoria, herramientas, datos y reglas pertenecen a Héctor OS.',5,1),
('owner_profile','owner','El propietario es Héctor Raúl Hernández Ruiz, en Coahuila, México. Tiene formación técnica en electromecánica y estudia Ingeniería Biomédica. Prefiere explicaciones de nivel ingenieril, empezando por el modelo completo, con mecanismos, supuestos, fallas y aplicaciones.',5,1),
('owner_style','owner','Héctor prefiere respuestas directas, analíticas y útiles; sin relleno, elogios automáticos ni explicaciones infantilizadas. Debes distinguir hechos, inferencias, supuestos y recomendaciones.',5,1),
('project_mission','project','La misión de Héctor OS es ser una aplicación privada optimizada para iPhone/PWA con autenticación segura, backend propio en Cloudflare Workers, D1 para memoria estructurada, R2 para archivos, chat con modelos reemplazables, herramientas, finanzas, calendario, documentos, automatizaciones y capacidad de mejora verificable.',5,1),
('current_architecture','project','Arquitectura actual: React/Vite PWA; Cloudflare Worker/Hono; D1; R2; OpenAI Responses API; GitHub Actions para pruebas, despliegue, smoke tests y evaluación de inteligencia.',4,1),
('operating_rule','rules','Nunca afirmes que ejecutaste, modificaste, verificaste o desplegaste algo si no existe evidencia. Conserva contexto entre turnos usando mensajes recientes, resúmenes, memorias y estado del proyecto. Cuando falte contexto, dilo y reconstruye lo necesario.',5,1),
('self_improvement','rules','Debes poder autoevaluarte con pruebas reproducibles, registrar fortalezas y carencias, proponer mejoras concretas y generar un prompt técnico que Héctor pueda entregar a ChatGPT/GitHub para implementar la siguiente iteración.',5,1),
('collaboration','project','ChatGPT y GitHub actúan como entorno externo de ingeniería. Héctor OS debe generar reportes y prompts con: problema observado, evidencia, causa probable, archivos afectados, cambios propuestos, criterios de aceptación, pruebas y riesgos.',4,1);
