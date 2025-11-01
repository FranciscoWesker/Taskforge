# Configuración de Firebase Authentication

## Pasos para configurar Firebase

### 1. Crear proyecto en Firebase Console

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Haz clic en "Agregar proyecto"
3. Ingresa un nombre para tu proyecto (ej: "taskforge")
4. Sigue las instrucciones para crear el proyecto

### 2. Registrar tu aplicación web

1. En Firebase Console, ve a **Project Settings** (ícono de engranaje)
2. En la sección "Your apps", haz clic en el ícono de **Web** (`</>`)
3. Registra tu app con un nombre (ej: "TaskForge Web")
4. **No marques** la opción "Also set up Firebase Hosting"
5. Haz clic en "Register app"

### 3. Copiar las credenciales

Firebase te mostrará un objeto de configuración como este:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 4. Actualizar la configuración en el código

Edita el archivo `frontend/src/app/core/firebase.config.ts` y reemplaza los valores:

```typescript
export const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
};
```

### 5. Habilitar métodos de autenticación

1. En Firebase Console, ve a **Authentication**
2. Haz clic en "Get started"
3. En la pestaña **Sign-in method**, habilita:
   - **Email/Password**: Activa y guarda
   - **Google** (opcional): Activa y configura (requiere configuración adicional)

### 6. Configurar dominios autorizados

1. En Authentication, ve a **Settings**
2. En "Authorized domains", asegúrate de que estén:
   - `localhost` (para desarrollo)
   - Tu dominio de producción (ej: `taskforge-21m4.onrender.com`)

### 7. Configurar Google Sign-In (opcional)

Si quieres habilitar el login con Google:

1. En Firebase Console, Authentication > Sign-in method
2. Habilita **Google**
3. Ingresa tu **Support email**
4. Guarda los cambios

### 8. Verificar la instalación

1. Ejecuta `npm run build` para compilar
2. Verifica que no hay errores
3. Inicia la aplicación y prueba:
   - Crear una cuenta nueva
   - Iniciar sesión con email/password
   - Iniciar sesión con Google (si está habilitado)

## Notas de seguridad

- **NO** subas `firebase.config.ts` con credenciales reales a repositorios públicos
- Las API keys de Firebase son públicas por diseño y seguras para uso en frontend
- Configura las reglas de seguridad en Firebase Realtime Database o Firestore si las usas

## Solución de problemas

### Error: "Firebase: Error (auth/domain-not-authorized)"
- Ve a Authentication > Settings > Authorized domains
- Agrega tu dominio a la lista

### Error: "Firebase: Error (auth/api-key-not-valid)"
- Verifica que copiaste correctamente todas las credenciales
- Asegúrate de que el archivo `firebase.config.ts` está correctamente formateado

### Error: "Firebase: Error (auth/operation-not-allowed)"
- Verifica que habilitaste el método de autenticación en Firebase Console
- Para Email/Password, debe estar activado en Sign-in method

