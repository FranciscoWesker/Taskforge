TaskForge
=========

Descripción general
-------------------
TaskForge es una aplicación de gestión de proyectos para equipos que combina tableros Kanban en tiempo real, comunicación por chat y integraciones con repositorios Git. Incluye sincronización en tiempo real mediante Socket.io, persistencia en MongoDB, autenticación con Firebase y una interfaz moderna construida con Angular y Taiga UI.

Características principales
--------------------------

**Gestión de Proyectos**
- Tableros Kanban con drag & drop interactivo y persistencia en MongoDB
- Límites WIP configurables por columna y persistentes por tablero
- Compartir tableros con miembros del equipo mediante email
- Gestión completa de tableros: crear, editar, eliminar y compartir

**Comunicación en Tiempo Real**
- Chat por tablero con historial persistente
- Presencia de usuarios en tiempo real
- Indicadores de escritura (typing indicators)
- Sincronización instantánea de mensajes mediante Socket.io

**Integración con GitHub**
- Conectar repositorios GitHub a tableros Kanban
- Creación automática de tarjetas desde commits y pull requests
- Mapeo configurable de ramas Git a columnas Kanban (todo, doing, done)
- Visualización del estado CI/CD directamente en las tarjetas
- Webhooks automatizados para sincronización en tiempo real
- Gestión de integraciones: conectar, configurar y eliminar repositorios

**Autenticación y Seguridad**
- Autenticación con Firebase Authentication
- Soporte para login con email/password
- Integración con Google OAuth
- Gestión de sesiones persistente y segura
- Guards de ruta para protección de páginas privadas

**Interfaz de Usuario**
- UI construida con Angular 20 (standalone components) y Taiga UI
- Diseño responsive con Tailwind CSS
- Animaciones suaves y microinteracciones
- Modo claro/oscuro (preparado para implementación)
- Página de inicio (landing page) profesional
- Componentes accesibles y optimizados para rendimiento

**Arquitectura y Rendimiento**
- Change detection optimizado con OnPush
- Lazy loading de componentes y rutas
- Rate limiting en el backend para protección contra abuso
- Configuración CORS segura para desarrollo y producción
- Health checks para monitoreo del servicio

Stack Tecnológico
-----------------
- **Frontend**: Angular 20 (standalone components), Taiga UI, Tailwind CSS, Firebase SDK
- **Backend**: Node.js, Express, Socket.io, Mongoose
- **Base de Datos**: MongoDB (Atlas o local)
- **Autenticación**: Firebase Authentication
- **Infraestructura**: Render (backend web service + static site)
- **Integraciones**: GitHub REST API, GitHub Webhooks

Estructura del repositorio
--------------------------
- `backend/`: API REST + Socket.io, modelos de datos, servicios de integración
  - `src/app.ts`: Endpoints REST y middleware
  - `src/socket/`: Configuración de Socket.io y eventos
  - `src/db/`: Modelos Mongoose (BoardState, Message, Integration)
  - `src/services/`: Servicios externos (GitHub API)
  - `src/middleware/`: Middleware personalizado (CORS, rate limiting)
  - `src/utils/`: Utilidades compartidas (configuración CORS)
- `frontend/`: Aplicación Angular standalone
  - `src/app/`: Componentes y rutas de la aplicación
  - `src/app/core/`: Servicios core (auth, socket, env)
  - `src/app/kanban/`: Componente de tablero Kanban con drag & drop
  - `src/app/chat/`: Componente de chat en tiempo real
  - `src/app/settings/`: Gestión de integraciones y configuraciones
- `render.yaml`: Blueprint para provisionar servicios en Render
- `docs/`: Documentación de arquitectura y decisiones técnicas

Arquitectura (resumen)
---------------------
Consulte `docs/ARCHITECTURE.md` para un diagrama y un desglose detallado de componentes. A alto nivel:

**Flujo de Datos**
- Frontend consume endpoints REST (`/api/*`) y se conecta vía Socket.io al mismo host del backend
- El backend expone endpoints REST para CRUD de tableros, tarjetas, mensajes e integraciones
- Socket.io maneja eventos en tiempo real: `board:join`, `kanban:update`, `board:chat:message`, etc.
- MongoDB almacena estado de tablero (`BoardState`), mensajes (`Message`) e integraciones (`Integration`)

**Flujos Clave**

**Kanban:**
1. Cargar estado inicial: `GET /api/boards/:id/kanban`
2. Drag & drop: `PATCH /api/boards/:id/cards/:cardId/move` + emite `kanban:update` vía Socket.io
3. Crear/editar/eliminar tarjeta: REST API + broadcast `kanban:update`
4. WIP: persistido en `BoardState.wipLimits` (`PATCH /api/boards/:id/wip`)

**Chat:**
1. Unirse a sala: `board:join { boardId, user }`
2. Enviar mensaje: `board:chat:message` → persistir en MongoDB y difundir
3. Presence/typing: eventos `board:presence`, `board:chat:typing`

**Integraciones GitHub:**
1. Verificar token: `POST /api/integrations/github/verify-token`
2. Listar repos: `POST /api/integrations/github/repos`
3. Conectar repo: `POST /api/boards/:boardId/integrations/github`
4. Webhook: `POST /webhooks/github` (verificación de firma, parsing de eventos)
5. Eventos procesados: push, pull_request, status (CI/CD)

**Autenticación:**
1. Login/Register: Firebase Authentication
2. Protección de rutas: `AuthGuard` verifica autenticación
3. Servicios: `AuthService` maneja sesión y estado de usuario

Requisitos
----------
- Node.js 18+ (recomendado LTS 20+)
- npm 9+
- (Opcional) MongoDB local o MongoDB Atlas
- (Opcional) Para desarrollo rápido puede usarse MongoDB en memoria (`USE_MEM_MONGO=true`)
- Cuenta de Firebase para autenticación (crear proyecto en Firebase Console)

Variables de entorno (backend)
------------------------------
Cree `backend/.env` con:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:4200
BACKEND_URL=http://localhost:4000
MONGODB_URI=mongodb://localhost:27017/taskforge
USE_MEM_MONGO=true
NODE_ENV=development
```

**Para producción (Render):**
- `CLIENT_ORIGIN`: URL del frontend (ej: `https://taskforge-21m4.onrender.com`)
- `BACKEND_URL`: URL del backend (ej: `https://taskforge-ufzf.onrender.com`)
- `MONGODB_URI`: URI de MongoDB Atlas (no usar `USE_MEM_MONGO` en producción)

Variables de entorno (frontend)
-------------------------------
Cree `frontend/src/app/core/firebase.config.ts` con su configuración de Firebase:

```typescript
export const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

Ejecución local
---------------

**1) Backend**

```bash
cd backend
npm install
npm run build
npm start
```

El servidor iniciará en `http://localhost:4000`. Endpoint de salud: `http://localhost:4000/health`.

**2) Frontend**

```bash
cd frontend
npm install
npm start
```

La aplicación iniciará en `http://localhost:4200`. En desarrollo, el frontend detecta automáticamente `localhost` y se conecta al backend local.

**3) Configuración de Firebase**

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com)
2. Habilitar Authentication → Email/Password y Google
3. Obtener configuración del proyecto
4. Actualizar `frontend/src/app/core/firebase.config.ts`

Despliegue en Render
--------------------
Este repositorio incluye `render.yaml` con dos servicios:

**Backend (Web Service)**
- Tipo: `web`
- Build: `npm install && npm run build`
- Start: `node dist/server.js`
- Health check: `/health`
- Variables de entorno requeridas:
  - `CLIENT_ORIGIN`: URL del frontend en Render
  - `BACKEND_URL`: URL del backend en Render
  - `MONGODB_URI`: URI de MongoDB Atlas (secreto)
  - `USE_MEM_MONGO`: "false" (o no configurar)

**Frontend (Static Site)**
- Tipo: `static_site`
- Build: `npm install && npm run build`
- Publish path: `dist/taskforge-ui/browser`
- Headers: Content-Security-Policy configurado
- Redirects: SPA routing configurado

**Pasos de despliegue:**
1. Configure `MONGODB_URI` como secreto del servicio backend en Render
2. Asegure que `CLIENT_ORIGIN` y `BACKEND_URL` apunten a las URLs correctas de Render
3. Despliegue con Render CLI o panel: `render blueprint deploy render.yaml`
4. Configure Firebase Authentication con las URLs de producción

**Nota sobre Render Free Tier:**
- El servicio puede dormirse tras inactividad (~15 minutos)
- La primera solicitud tras inactividad puede tardar ~30 segundos en responder
- Considere usar un plan pago para producción

API REST
--------

**Tableros**
- `GET /api/boards?owner=email`: Listar tableros del usuario
- `POST /api/boards`: Crear nuevo tablero
- `GET /api/boards/:boardId`: Obtener metadata del tablero
- `PUT /api/boards/:boardId`: Actualizar nombre del tablero
- `DELETE /api/boards/:boardId`: Eliminar tablero
- `POST /api/boards/:boardId/share`: Compartir tablero (agregar miembro)
- `DELETE /api/boards/:boardId/share`: Remover miembro compartido

**Kanban**
- `GET /api/boards/:boardId/kanban`: Obtener estado Kanban
- `POST /api/boards/:boardId/cards`: Crear tarjeta
- `PATCH /api/boards/:boardId/cards/:cardId`: Editar tarjeta
- `PATCH /api/boards/:boardId/cards/:cardId/move`: Mover tarjeta entre columnas
- `DELETE /api/boards/:boardId/cards/:cardId`: Eliminar tarjeta
- `PATCH /api/boards/:boardId/wip`: Actualizar límites WIP

**Chat**
- `GET /api/boards/:boardId/messages`: Obtener historial de mensajes

**Integraciones**
- `POST /api/integrations/github/verify-token`: Verificar token de GitHub
- `POST /api/integrations/github/repos`: Listar repositorios del usuario
- `GET /api/boards/:boardId/integrations`: Listar integraciones del tablero
- `POST /api/boards/:boardId/integrations/github`: Conectar repositorio GitHub
- `GET /api/integrations/:integrationId/branches`: Obtener ramas del repositorio
- `PUT /api/integrations/:integrationId/branch-mapping`: Configurar mapeo de ramas
- `PUT /api/integrations/:integrationId/config`: Actualizar configuración (autoCreateCards, autoCloseCards)
- `DELETE /api/integrations/:integrationId`: Eliminar integración

**Webhooks**
- `POST /webhooks/github`: Webhook de GitHub (verificación de firma, procesamiento de eventos)

Eventos Socket.io
----------------

**Cliente → Servidor**
- `board:join { boardId, user }`: Unirse a sala del tablero
- `board:leave { boardId }`: Abandonar sala del tablero
- `board:chat:message { boardId, author, text }`: Enviar mensaje
- `board:chat:typing { boardId, author, typing }`: Indicar escritura

**Servidor → Cliente**
- `kanban:update { boardId, todo?, doing?, done?, name?, wipLimits? }`: Actualización de estado Kanban
- `board:chat:message { boardId, author, text, ts }`: Nuevo mensaje recibido
- `board:presence [users]`: Lista de usuarios activos en el tablero
- `board:chat:typing { boardId, author, typing }`: Usuario escribiendo

Seguridad
---------

**CORS**
- Configuración segura para desarrollo (permite localhost automáticamente)
- En producción, solo permite orígenes configurados en `CLIENT_ORIGIN`
- Headers CORS aplicados incluso en errores (404, 500)

**Rate Limiting**
- Límites configurables por tipo de endpoint
- Protección contra abuso en endpoints de escritura
- Límites más estrictos para autenticación e integraciones

**Autenticación**
- Firebase Authentication para gestión de usuarios
- Guards de ruta protegen páginas privadas
- Tokens de acceso almacenados de forma segura

**Webhooks**
- Verificación de firma HMAC para webhooks de GitHub
- Validación de hosts permitidos para prevenir SSRF
- Rate limiting específico para endpoints de webhook

**Base de Datos**
- No utilice `USE_MEM_MONGO=true` en producción
- Use MongoDB Atlas o instancia MongoDB persistente
- Configure credenciales de base de datos como secretos

Pruebas y calidad
-----------------
- Linting: ESLint configurado en backend y frontend
- Type checking: TypeScript estricto habilitado
- Build checks: Verificación de tipos antes de deploy
- Unit/e2e tests: Pendiente de implementación

Desarrollo
----------

**Estructura de commits**
- Mensajes descriptivos en español
- Separación clara de features, fixes y mejoras

**Pull Requests**
- Descripción clara de cambios
- Verificación de builds antes de merge
- Code review recomendado

**Roadmap**
- Integración con GitLab y Bitbucket
- Notificaciones push
- Exportación de datos
- API pública documentada (OpenAPI/Swagger)
- Tests automatizados (unit, integration, e2e)

Licencia
--------
Este proyecto se publica bajo la **GNU General Public License v3.0 (GPL-3.0)**. Consulte el archivo `LICENSE` para más detalles.

Créditos y Tecnologías
----------------------
- **Framework Frontend**: Angular 20, Taiga UI, Tailwind CSS
- **Framework Backend**: Node.js, Express, Socket.io
- **Base de Datos**: MongoDB, Mongoose
- **Autenticación**: Firebase Authentication
- **Integraciones**: GitHub REST API
- **Infraestructura**: Render (blueprint deployment)
- **Control de Versiones**: Git, GitHub
