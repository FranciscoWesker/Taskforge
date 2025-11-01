# Desplegar y Probar Firebase Authentication en Render

## Pasos para desplegar

### 1. Agregar dominio de Render a Firebase

**IMPORTANTE:** Antes de desplegar, debes agregar el dominio de Render a los dominios autorizados de Firebase:

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto: `taskforge-6e052`
3. Ve a **Authentication** > **Settings**
4. En la sección **Authorized domains**, haz clic en **Add domain**
5. Agrega el dominio de tu aplicación en Render:
   - Si ya tienes un dominio, agréguelo (ej: `taskforge-21m4.onrender.com`)
   - También agrega `localhost` si no está (para desarrollo local)
6. Guarda los cambios

### 2. Habilitar métodos de autenticación en Firebase

1. En Firebase Console, ve a **Authentication** > **Sign-in method**
2. Habilita los métodos que necesites:
   - **Email/Password**: Activa y guarda (OBLIGATORIO)
   - **Google**: Activa y configura si quieres usar login con Google (opcional)

### 3. Hacer commit y push

```bash
git add .
git commit -m "feat: Implementar Firebase Authentication"
git push origin main
```

### 4. Desplegar en Render

Si usas **Render Blueprint** (recomendado):

1. Ve a tu dashboard de Render
2. Si tienes el blueprint configurado, el deploy se hará automáticamente al hacer push
3. Si no, crea un nuevo Blueprint Service desde `render.yaml`

**O manualmente:**

1. Ve a tu dashboard de Render
2. Si ya tienes el servicio `taskforge-frontend`:
   - Ve a **Manual Deploy** > **Deploy latest commit**
3. Si no tienes el servicio:
   - Crea un nuevo **Static Site**
   - Configura:
     - **Name**: `taskforge-frontend`
     - **Root Directory**: `frontend`
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `dist/taskforge-ui/browser`

### 5. Verificar el deploy

Una vez que Render termine el deploy:

1. Ve a tu servicio en Render Dashboard
2. Copia la URL del servicio (ej: `https://taskforge-21m4.onrender.com`)
3. Abre la URL en tu navegador

### 6. Probar la autenticación

#### Probar registro:

1. Ve a `https://tu-url.onrender.com/register`
2. Completa el formulario:
   - Nombre completo
   - Email válido
   - Contraseña (mínimo 6 caracteres)
   - Confirma contraseña
   - Acepta términos
3. Haz clic en "Crear cuenta"
4. Debería redirigirte a `/app`

#### Probar login:

1. Ve a `https://tu-url.onrender.com/login`
2. Ingresa el email y contraseña que usaste para registrarte
3. Haz clic en "Entrar"
4. Debería redirigirte a `/app`

#### Probar login con Google (si está habilitado):

1. Ve a `https://tu-url.onrender.com/login`
2. Haz clic en "Continuar con Google"
3. Autoriza la aplicación en la ventana de Google
4. Debería redirigirte a `/app`

#### Probar protección de rutas:

1. Sin estar autenticado, intenta acceder a `https://tu-url.onrender.com/app`
2. Debería redirigirte automáticamente a `/login`

### 7. Verificar en Firebase Console

1. Ve a Firebase Console > Authentication > Users
2. Deberías ver los usuarios que se han registrado

## Solución de problemas

### Error: "Firebase: Error (auth/domain-not-authorized)"

**Solución:**
- Ve a Firebase Console > Authentication > Settings > Authorized domains
- Agrega tu dominio de Render (ej: `taskforge-21m4.onrender.com`)

### Error: "Firebase: Error (auth/operation-not-allowed)"

**Solución:**
- Ve a Firebase Console > Authentication > Sign-in method
- Habilita "Email/Password" o "Google" según el método que estés usando

### Error: "Firebase: Error (auth/network-request-failed)"

**Solución:**
- Verifica que el CSP en `render.yaml` incluya los dominios de Firebase
- Verifica que el dominio esté en los dominios autorizados de Firebase

### La aplicación no carga después del deploy

**Solución:**
- Verifica los logs de build en Render Dashboard
- Verifica que el `staticPublishPath` sea correcto: `dist/taskforge-ui/browser`
- Verifica que el build no tenga errores

### El login funciona pero redirige a una URL incorrecta

**Solución:**
- Verifica que `CLIENT_ORIGIN` en `render.yaml` apunte a la URL correcta del frontend
- El backend debe saber a qué URL redirigir

## Notas importantes

- **Dominios autorizados**: Siempre agrega el dominio de Render a Firebase antes de desplegar
- **CSP**: El Content Security Policy ya está actualizado para permitir Firebase
- **Build**: El build de Render debe incluir todas las dependencias de Firebase
- **Logs**: Si algo falla, revisa los logs de build en Render Dashboard

## Verificar configuración

Antes de desplegar, verifica:

- [ ] `firebase.config.ts` tiene las credenciales correctas
- [ ] Firebase Console tiene habilitado Email/Password
- [ ] El dominio de Render está en Authorized domains de Firebase
- [ ] `render.yaml` está actualizado con el CSP correcto
- [ ] Has hecho commit y push de todos los cambios

