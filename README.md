# Xtreet AI - REx Engine (Reality Extraction Engine)

Implementación completa del motor backend central de Xtreet AI en TypeScript/Next.js 16, desplegable en Vercel con integración a Supabase para memoria persistente.

## 🎯 Qué es REx Engine

El **Reality Extraction Engine** (REx) es el motor de orquestación central que procesa cada petición de usuario:

1. **Análisis** — Parse semántico, detección de intención y riesgo.
2. **Clasificación** — Categorización en 10 categorías (creative, emotional, code, vision, etc.).
3. **Descomposición** — División opcional de preguntas complejas en micro-tareas.
4. **Routing** — Selección inteligente de modelos por categoría.
5. **Orquestación** — Llamadas concurrentes a proveedores (OpenAI, Claude, Gemini, etc.) con timeouts y manejo de errores.
6. **Ensamblado** — Fusión coherente de respuestas parciales.
7. **Verificación** — Checks técnicos (código, matemáticas) via verifier local.
8. **Estilo XTreet** — Reescritura final en tono minimal/cinematográfico.
9. **Memoria** — Persistencia en Supabase (si autorizado).
10. **Logging & Métricas** — Latencias, tokens, costos.

## 📦 Stack Técnico

- **Lenguaje**: TypeScript 5
- **Framework**: Next.js 16 (App Router)
- **Database/Auth**: Supabase (Postgres + RLS)
- **Testing**: Vitest
- **Linting**: ESLint 9 + Prettier 3
- **Deployment**: Vercel + Edge Functions
- **Caching**: LRU (in-memory)
- **Rate Limiting**: Token bucket (in-memory para dev, Redis/Upstash para prod)

## 🚀 Inicio Rápido

### Requisitos

- Node.js 18+ y npm/yarn
- Cuenta Supabase (gratuita: https://supabase.com)
- OpenAI API key (https://platform.openai.com/account/api-keys)

### 1. Instalación Local

```bash
# Clona el repo
git clone https://github.com/HelloImAfar/xtreet-ai.git
cd xtreet-ai

# Instala dependencias
npm install

# Copia .env.example a .env.local y configura tus claves
cp .env.example .env.local
# Edita .env.local con tus valores reales
```

### 2. Variables de Entorno (.env.local)

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# OpenAI (Proveedor principal)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Otros proveedores (opcionales, stubs por defecto)
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
NODE_ENV=development
```

### 3. Ejecuta Localmente

```bash
npm run dev
npm test
npm run typecheck
npm run lint
npm run format
```

## 🗂️ Estructura del Proyecto

```
/app/api
  /messages/route.ts     # POST: procesa mensaje via REx Engine
  /classify/route.ts     # POST: solo clasifica texto
  /memory/route.ts       # GET/POST: manage user memory
  /health/route.ts       # GET: health checks

/core
  /models                # Wrappers de proveedores (openai.ts, claude.ts, etc.)
  engine.ts              # REx Engine principal
  classifier.ts          # Clasificador
  decomposer.ts          # Task decomposition
  assembler.ts           # Merge de respuestas
  verifier.ts            # Verificador
  styleWrapper.ts        # Estilo XTreet
  memory.ts              # Supabase integration
  logger.ts              # Logger JSON

/lib
  utils.ts               # timeoutPromise, retry

/types
  index.ts               # TypeScript definitions

/tests
  /unit                  # Unit tests
  /integration           # Integration tests
```

## 📝 Endpoints API

### POST /api/messages
```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "text": "Write a poem", "stream": false}'
```

### POST /api/classify
```bash
curl -X POST http://localhost:3000/api/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "How do I fix this bug?"}'
```

### GET /api/memory
```bash
curl "http://localhost:3000/api/memory?userId=user-123"
```

### POST /api/memory
```bash
curl -X POST http://localhost:3000/api/memory \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "key": "preferences", "value": {"theme": "dark"}}'
```

### GET /api/health
```bash
curl http://localhost:3000/api/health
```

## 🧪 Tests

```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- classifier     # Run specific test file
```

### Test Coverage

- **Classifier**: 20+ test cases para todas las categorías
- **Model Selection**: Verify routing por categoría
- **Engine Integration**: Rate limiting, memory, async orchestration

## 🚀 Deploy a Vercel

1. Push código a GitHub:
```bash
git add .
git commit -m "Add REx Engine"
git push origin main
```

2. Ve a https://vercel.com/new y conecta tu repo

3. Configura variables de entorno:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `OPENAI_API_KEY`

4. Verifica health:
```bash
curl https://your-deployment.vercel.app/api/health
```

## 🗄️ Setup Supabase

1. Crea tabla `user_memory`:

```sql
CREATE TABLE user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, key)
);

CREATE INDEX idx_user_memory_user_id ON user_memory(user_id);

ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_memory_policy ON user_memory
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
```

2. Obtén credenciales en **Settings > API**

## 🔌 Integración de Nuevos Proveedores

Cada proveedor en `core/models/{provider}.ts` expone:

```typescript
export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  // payload: { prompt, maxTokens, temperature, model, stream }
  // return: { text, tokensUsed, meta }
}
```

### Ejemplo: Anthropic Claude

1. Actualiza `core/models/claude.ts`
2. Instala SDK: `npm install @anthropic-ai/sdk`
3. Usa en `selectModel()` en `core/engine.ts`

## 🔐 Seguridad

- **Rate Limiting**: In-memory token bucket (10 req/min per IP)
- **Cost Control**: Estimación de tokens + logs
- **Input Sanitization**: Max 5000 caracteres
- **Caching**: LRU cache (100 entries, 1h TTL)

## 📈 Logs

Todos los logs son JSON estructurado:

```json
{
  "level": "info",
  "message": "Message handled successfully",
  "userId": "user-123",
  "category": "creative",
  "tokensUsed": 245,
  "estimatedCost": 0.011,
  "elapsedMs": 1234,
  "ts": "2025-12-06T10:30:45Z"
}
```

## 📄 Licencia

MIT

---

**Disfruta construyendo con Xtreet AI REx Engine!** 🚀
