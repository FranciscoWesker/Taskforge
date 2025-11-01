# Correcciones para Problemas en Render

## Problemas identificados y soluciones

### 1. Iconos de Taiga UI (404) ✅ SOLUCIONADO

**Problema**: Los iconos no se encontraban (404) porque no estaban configurados como assets y no había un resolver de iconos.

**Solución aplicada**:
- ✅ Agregado resolver de iconos en `app.config.ts`
- ✅ Agregados iconos como assets en `angular.json`
- ✅ Mapeo de nombres de iconos a archivos SVG configurado

**Iconos mapeados**:
- `tuiIconMenu` → `menu.svg`
- `tuiIconSun` / `tuiIconSunLarge` → `sun.svg` / `sun-filled.svg`
- `tuiIconMoon` / `tuiIconMoonLarge` → `sun-moon.svg` / `sun-moon-filled.svg`
- `tuiIconLogOut` → `log-out.svg`
- `tuiIconGrid` / `tuiIconGridLarge` → `grid.svg` / `grid-2x2-filled.svg`
- `tuiIconEdit` → `edit.svg`
- `tuiIconTrash` → `trash.svg`
- `tuiIconPlus` → `plus.svg`
- `tuiIconRefresh` → `refresh-cw.svg`
- `tuiIconSettings` → `settings.svg`
- `tuiIconCheck` → `check.svg`
- `tuiIconGoogle` → `google.svg` (si existe)
- `tuiIconCode` → `code-2.svg`
- `tuiIconMessage` → `message-circle-2.svg`
- `tuiIconLogIn` → `log-in.svg`

### 2. CORS Missing Allow Origin ⚠️ PENDIENTE VERIFICAR

**Problema**: El frontend no puede conectarse al backend debido a CORS.

**Posibles causas**:
1. Backend no está corriendo en Render
2. `CLIENT_ORIGIN` no está configurado correctamente
3. El dominio del frontend no coincide con el configurado en el backend

**Verificar**:
1. En Render Dashboard, verifica que el servicio `taskforge-backend` esté corriendo
2. Verifica que `CLIENT_ORIGIN` esté configurado como `https://taskforge-21m4.onrender.com`
3. En `render.yaml`, el backend tiene `CLIENT_ORIGIN: https://taskforge-21m4.onrender.com`

**Solución**:
- El backend ya tiene CORS configurado: `cors({ origin: process.env.CLIENT_ORIGIN || '*', credentials: true })`
- Si el backend no está corriendo, inicia el servicio en Render
- Si el dominio del frontend cambió, actualiza `CLIENT_ORIGIN` en Render

### 3. WebSocket Connection Refused ⚠️ PENDIENTE VERIFICAR

**Problema**: No se puede conectar a WebSocket (`wss://taskforge-backend.onrender.com/socket.io/`).

**Posibles causas**:
1. Backend no está corriendo
2. Socket.io no está configurado correctamente
3. CORS de Socket.io no permite el origen del frontend

**Verificar**:
1. El backend debe estar corriendo
2. Socket.io está configurado con `cors: { origin: process.env.CLIENT_ORIGIN, credentials: true }`
3. El frontend usa `SOCKET_URL` que apunta a `API_BASE`

**Solución**:
- Verifica que el backend esté corriendo en Render
- Verifica que `CLIENT_ORIGIN` esté configurado correctamente en el backend
- Los transportes de Socket.io están configurados: `['websocket', 'polling']`

### 4. API 404 ⚠️ PENDIENTE VERIFICAR

**Problema**: `GET https://taskforge-backend.onrender.com/api/boards/demo/kanban` devuelve 404.

**Posibles causas**:
1. Backend no está corriendo
2. La ruta no existe o está mal configurada
3. El backend no está respondiendo correctamente

**Verificar**:
1. El backend debe estar corriendo
2. La ruta `/api/boards/:boardId/kanban` existe en `backend/src/app.ts`
3. El backend responde correctamente en `/health`

**Solución**:
- Verifica que el backend esté corriendo en Render
- Haz una petición a `https://taskforge-backend.onrender.com/health` para verificar
- Si el backend no está corriendo, inicia el servicio en Render

## Pasos para desplegar y verificar

### 1. Hacer commit de los cambios

```bash
git add .
git commit -m "fix: Configurar iconos de Taiga UI y resolver problemas de assets"
git push origin main
```

### 2. Verificar deploy en Render

1. Ve a Render Dashboard
2. Verifica que ambos servicios (`taskforge-backend` y `taskforge-frontend`) estén desplegados
3. Verifica los logs de build para asegurarte de que no hay errores

### 3. Verificar backend

1. Abre `https://taskforge-backend.onrender.com/health` en tu navegador
2. Debe responder con `{"status":"ok"}`
3. Si no responde, verifica los logs del backend en Render

### 4. Verificar frontend

1. Abre `https://taskforge-21m4.onrender.com` en tu navegador
2. Verifica en la consola del navegador que:
   - Los iconos se cargan correctamente (no hay 404)
   - El backend responde (no hay errores de CORS)
   - Socket.io se conecta (no hay errores de WebSocket)

### 5. Si el backend no está disponible

**Crear servicio backend en Render**:
1. Ve a Render Dashboard > New > Web Service
2. Conecta tu repositorio
3. Configura:
   - **Name**: `taskforge-backend`
   - **Environment**: `Node`
   - **Root Directory**: `backend`
   - **Build Command**: `NPM_CONFIG_PRODUCTION=false npm install && npm run build`
   - **Start Command**: `node dist/server.js`
   - **Health Check Path**: `/health`
4. Agrega variables de entorno:
   - `CLIENT_ORIGIN`: `https://taskforge-21m4.onrender.com`
   - `USE_MEM_MONGO`: `true`
   - `MONGODB_URI`: (dejar vacío o configurar si tienes MongoDB)

### 6. Verificar iconos faltantes

Si algún icono no se encuentra:
1. Busca el archivo SVG en `node_modules/@taiga-ui/icons/src/`
2. Agrega el mapeo en `app.config.ts` en el objeto `iconMap`

## Notas importantes

- Los iconos ahora se copian como assets en el build
- El resolver de iconos mapea los nombres de iconos a las rutas de los archivos SVG
- Si falta algún icono, agrégalo al mapeo en `app.config.ts`
- El backend debe estar corriendo para que el frontend funcione correctamente

