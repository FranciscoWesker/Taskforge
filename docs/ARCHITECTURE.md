Arquitectura de TaskForge
=========================

Componentes
-----------
- Frontend (Angular 20):
  - Standalone Components (rutas en `app.routes.ts`).
  - Kanban (`kanban-board-dnd.component.ts`): drag & drop con CDK, WIP persistente y sincronización por socket.
  - Chat (`chat.component.ts`): presencia, typing y mensajes persistentes.
  - Servicios núcleo (`core/`): auth dummy, socket, env.

- Backend (Node/Express):
  - `src/app.ts`: endpoints REST (boards, kanban, chat history).
  - `src/socket/index.ts`: eventos Socket.io (join/leave board, kanban:update, chat:message, presence/typing).
  - `src/db/*`: modelos Mongoose (`BoardState`, `Message`).

Flujos clave
------------
- Kanban:
  1. Cargar estado inicial: GET `/api/boards/:id/kanban`.
  2. Drag & drop: PATCH `/api/boards/:id/cards/:cardId/move` + emite `kanban:update`.
  3. Crear/editar/eliminar tarjeta: REST + broadcast `kanban:update`.
  4. WIP: persistido en `BoardState.wipLimits` (PATCH `/api/boards/:id/wip`).

- Chat:
  1. Join sala: `board:join { boardId, user }`.
  2. Mensaje: `board:chat:message` → persistir y difundir.
  3. Presence/typing: `board:presence`, `board:chat:typing`.

Despliegue
----------
- Render blueprint (`render.yaml`):
  - Backend Node web service.
  - Frontend static site con redirect SPA.
  - Configurar `MONGODB_URI` como secreto en Render.

Consideraciones
---------------
- Autenticación actual es placeholder (AuthService localStorage). Para producción: JWT + guard de Socket.io.
- `USE_MEM_MONGO` solo para desarrollo local rapido.


