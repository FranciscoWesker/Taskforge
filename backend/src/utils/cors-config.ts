/**
 * Utilidades para configuración de CORS segura.
 * Soporta desarrollo local y producción con buenas prácticas de seguridad.
 */

/**
 * Detecta si estamos en entorno de desarrollo local.
 * Basado en puerto, hostname y variables de entorno.
 */
export function isDevelopment(): boolean {
  // Si NODE_ENV está explícitamente en 'production', no es desarrollo
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  // Si CLIENT_ORIGIN contiene onrender.com, probablemente es producción
  const clientOrigin = process.env.CLIENT_ORIGIN || '';
  if (clientOrigin.includes('onrender.com') || clientOrigin.includes('https://')) {
    // A menos que sea explícitamente localhost
    if (!clientOrigin.includes('localhost') && !clientOrigin.includes('127.0.0.1')) {
      return false;
    }
  }

  // Si el puerto es el predeterminado de desarrollo (4000) y no hay CLIENT_ORIGIN configurado
  const port = Number(process.env.PORT || 4000);
  if (port === 4000 && !clientOrigin) {
    return true;
  }

  // Si hay variable de entorno explícita
  if (process.env.NODE_ENV === 'development' || process.env.DEV === 'true') {
    return true;
  }

  return false;
}

/**
 * Valida si un origen es localhost válido para desarrollo.
 */
export function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const localhostPatterns = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    const hostname = url.hostname.toLowerCase();
    
    // Verificar que sea localhost y un puerto común de desarrollo
    if (localhostPatterns.some(pattern => hostname === pattern || hostname.startsWith(pattern))) {
      const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
      // Puertos comunes de desarrollo frontend: 3000, 4200, 5173, 8080
      const devPorts = [3000, 4200, 5173, 8080, 5174, 3001];
      return devPorts.includes(port) || port >= 3000 && port <= 9999;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Obtiene la lista de orígenes permitidos para CORS.
 * En desarrollo, agrega automáticamente localhost.
 * En producción, solo usa los orígenes configurados en CLIENT_ORIGIN.
 */
export function getAllowedOrigins(): string[] {
  const clientOriginEnv = process.env.CLIENT_ORIGIN || '';
  
  // Parsear orígenes de la variable de entorno (separados por comas)
  const origins = clientOriginEnv
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .filter(o => o !== '*' && o !== 'null');

  const isDev = isDevelopment();

  // En desarrollo, agregar orígenes localhost comunes si no están ya incluidos
  if (isDev) {
    const localhostOrigins = [
      'http://localhost:4200',  // Angular default
      'http://localhost:3000',  // React/Vite default
      'http://localhost:5173',  // Vite default
      'http://127.0.0.1:4200',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ];

    for (const localOrigin of localhostOrigins) {
      if (!origins.includes(localOrigin)) {
        origins.push(localOrigin);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[CORS] Modo desarrollo detectado. Orígenes permitidos: [${origins.join(', ')}]`);
  } else {
    // En producción, solo usar orígenes explícitos
    if (origins.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[CORS] Producción detectada pero CLIENT_ORIGIN no configurado. Se bloquearán todas las solicitudes CORS.');
    } else {
      // eslint-disable-next-line no-console
      console.log(`[CORS] Modo producción. Orígenes permitidos: [${origins.join(', ')}]`);
    }
  }

  return origins;
}

/**
 * Valida si un origen está permitido para CORS.
 * En desarrollo, permite localhost automáticamente.
 * En producción, solo permite orígenes explícitamente configurados.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  const allowedOrigins = getAllowedOrigins();

  // Verificar contra lista explícita
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // En desarrollo, permitir localhost adicionales si pasan validación
  if (isDevelopment() && isLocalhostOrigin(origin)) {
    // eslint-disable-next-line no-console
    console.log(`[CORS] Permitiendo localhost en desarrollo: ${origin}`);
    return true;
  }

  return false;
}

/**
 * Obtiene el origen CORS permitido para una solicitud específica.
 * Retorna el origen si está permitido, undefined si no.
 */
export function getCorsOrigin(origin: string | undefined): string | undefined {
  if (isOriginAllowed(origin)) {
    return origin;
  }

  const allowedOrigins = getAllowedOrigins();
  
  // Si hay un solo origen permitido y no hay Origin header, usar ese
  if (!origin && allowedOrigins.length === 1) {
    return allowedOrigins[0];
  }

  return undefined;
}

