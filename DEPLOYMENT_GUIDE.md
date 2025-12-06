# Guía Rápida de Deployment - REx Engine

## 🚀 Deploy a Vercel (5 minutos)

### Paso 1: Prepara el código
```bash
cd /workspaces/xtreet-ai
git add .
git commit -m "Add REx Engine - Reality Extraction Engine implementation"
git push origin main
```

### Paso 2: Conecta con Vercel
1. Ve a https://vercel.com/new
2. Selecciona tu repo (xtreet-ai)
3. Vercel detectará automáticamente Next.js
4. Haz clic en "Deploy"

### Paso 3: Configura Variables de Entorno
En Vercel Dashboard:
1. Abre **Settings > Environment Variables**
2. Añade:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o
   NODE_ENV=production
   ```
3. Haz clic en "Save & Deploy"

### Paso 4: Verifica el Deploy
```bash
curl https://your-app.vercel.app/api/health
```

Respuesta esperada:
```json
{
  "ok": true,
  "checks": {
    "supabase_configured": true,
    "openai_configured": true,
    "uptime": 123.45,
    "timestamp": "2025-12-06T..."
  },
  "message": "All systems operational"
}
```

---

## 🗄️ Setup Supabase (10 minutos)

### Paso 1: Crea Tabla
En Supabase Dashboard, SQL Editor:

```sql
-- Crear tabla
CREATE TABLE IF NOT EXISTS user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Crear índice
CREATE INDEX IF NOT EXISTS idx_user_memory_user_id 
  ON user_memory(user_id);

-- Habilitar RLS
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;

-- Crear política (comentar si no usas auth)
CREATE POLICY user_memory_policy ON user_memory
  FOR ALL
  USING (true)  -- Dev: permitir todo (comentar en prod)
  WITH CHECK (true);

-- O política con auth (descomentar en prod):
-- USING (auth.uid()::text = user_id)
-- WITH CHECK (auth.uid()::text = user_id);
```

### Paso 2: Obtén Credenciales
1. Ve a **Settings > API**
2. Copia `Project URL` → `SUPABASE_URL`
3. Copia `anon public` key → `SUPABASE_KEY`
4. Pega en `.env.local` y Vercel

### Paso 3: Prueba Conexión
```bash
curl -X POST http://localhost:3000/api/memory \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "key": "test", "value": {"data": "hello"}}'
```

---

## 🔑 Variables de Entorno Completas

Copia a `.env.local` (desarrollo) y Vercel (production):

```env
# ========== REQUIRED ==========
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# OpenAI (Proveedor principal)
OPENAI_API_KEY=sk-...
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# ========== OPTIONAL ==========
# Otros proveedores (si los usas)
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
GROK_API_KEY=xai-...
QWEN_API_KEY=...
MISTRAL_API_KEY=...
LLAMA_API_KEY=...

# ========== APP CONFIG ==========
NODE_ENV=production
PORT=3000
```

---

## 🧪 Prueba los Endpoints

### 1. POST /api/messages (Procesa mensaje)
```bash
curl -X POST https://your-app.vercel.app/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "text": "Write a creative poem about technology",
    "stream": false
  }'
```

Respuesta:
```json
{
  "ok": true,
  "category": "creative",
  "modelPlan": ["gpt-4o"],
  "response": "... contenido generado ...",
  "tokensUsed": 245,
  "estimatedCost": 0.011,
  "errors": null
}
```

### 2. POST /api/classify (Solo clasifica)
```bash
curl -X POST https://your-app.vercel.app/api/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "How do I fix this bug in my code?"}'
```

Respuesta:
```json
{
  "ok": true,
  "category": "code",
  "confidence": 0.9,
  "decomposition": [{"id": "t0", "text": "How do I fix this bug in my code?"}]
}
```

### 3. GET /api/memory (Obtiene memoria)
```bash
curl "https://your-app.vercel.app/api/memory?userId=user-123"
```

Respuesta:
```json
{
  "ok": true,
  "memory": [
    {"id": "uuid", "key": "last_message", "value": {...}, "updated_at": "..."}
  ]
}
```

### 4. POST /api/memory (Inserta/actualiza)
```bash
curl -X POST https://your-app.vercel.app/api/memory \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "key": "preferences",
    "value": {"theme": "dark", "language": "es"}
  }'
```

### 5. GET /api/health (Health check)
```bash
curl https://your-app.vercel.app/api/health
```

---

## 🔐 Seguridad en Production

### 1. Rate Limiting
Actualiza en `core/engine.ts`:
```typescript
const RATE_LIMIT_MAX_TOKENS = 10;  // dev
// En prod: integra Redis/Upstash
```

### 2. Cost Limits
Agrega en las rutas API:
```typescript
if (result.estimatedCost > 0.50) {  // $0.50 per request limit
  return NextResponse.json({
    ok: false,
    error: 'Cost limit exceeded'
  }, { status: 429 });
}
```

### 3. API Keys
Nunca commitees .env.local:
```bash
echo ".env.local" >> .gitignore
git add .gitignore
git commit -m "Add .env.local to gitignore"
```

### 4. Monitoreo
Integra logs con Datadog/CloudWatch:
```typescript
// En core/logger.ts
if (process.env.DATADOG_API_KEY) {
  // Send logs to Datadog
}
```

---

## 📈 Monitoreo & Observabilidad

Los logs JSON incluyen:
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

### Ver logs en Vercel
1. Dashboard → Deployment → Function Logs
2. Filtra por `category`, `userId`, `elapsedMs`

### Integrar con Datadog
```bash
npm install dd-trace
```

En `app/api/messages/route.ts`:
```typescript
import tracer from 'dd-trace';

export const tracer = tracer.init();
```

---

## 🔌 Integrar Nuevos Proveedores

Ejemplo: Integrar Anthropic Claude

### 1. Instala SDK
```bash
npm install @anthropic-ai/sdk
```

### 2. Actualiza `core/models/claude.ts`
```typescript
import { Anthropic } from '@anthropic-ai/sdk';
import type { CallModelPayload, ModelResponse } from '../../types';
import { retry } from '../../lib/utils';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  const fn = async () => {
    const msg = await client.messages.create({
      model: payload.model || 'claude-3-5-sonnet-20241022',
      max_tokens: payload.maxTokens || 512,
      messages: [{ role: 'user', content: payload.prompt }]
    });

    const text = msg.content.map(c => c.text).join('\n');
    const tokensUsed = msg.usage.input_tokens + msg.usage.output_tokens;
    return { text, tokensUsed, meta: { raw: msg } };
  };

  return retry(fn, 3, 300);
}

export default { callModel };
```

### 3. Usa en `selectModel()` (`core/engine.ts`)
```typescript
import claude from './models/claude';

function selectModel(category: Category) {
  switch (category) {
    case 'emotional':
      return { model: 'claude-3-5-sonnet-20241022', module: claude, temperature: 0.7 };
    // ... más casos
  }
}
```

### 4. Deploy
```bash
git add . && git commit -m "feat: Add Claude integration" && git push origin main
```

---

## 🧹 Cleanup & Rollback

Si algo falla:

```bash
# Ver últimas deployments
vercel deployments list

# Rollback a última versión estable
vercel rollback

# Ver logs de error
vercel logs your-app.vercel.app --follow

# Redeployar sin cambios
vercel --prod
```

---

## 📞 Troubleshooting

### Error: "OPENAI_API_KEY not configured"
→ Verifica que OPENAI_API_KEY esté en Vercel Environment Variables

### Error: "Supabase not configured"
→ Normal en dev sin credenciales. En prod, verifica SUPABASE_URL + SUPABASE_KEY

### Error: "Rate limit exceeded"
→ Esperado. Espera 1 min o reduce RATE_LIMIT_MAX_TOKENS en engine.ts

### Error: "Cannot find module"
→ Ejecuta: `npm install`

---

## ✨ Próximos Pasos

1. **Configura variables** → .env.local + Vercel
2. **Crea tabla Supabase** → user_memory
3. **Deploy a Vercel** → Automático con git push
4. **Prueba endpoints** → curl examples arriba
5. **Monitorea** → Vercel logs + Datadog (optional)
6. **Integra proveedores** → Reemplaza stubs
7. **Escala** → Redis rate limiting para prod

---

**Última actualización**: 6 de Diciembre de 2025  
**Status**: 🟢 Ready to Deploy
