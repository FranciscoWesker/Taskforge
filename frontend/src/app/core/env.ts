/**
 * Valida que una URL no sea protocol-relative (no empiece con //).
 * Las URLs protocol-relative pueden causar vulnerabilidades de XSRF token leak.
 * 
 * @param url - URL a validar
 * @returns true si la URL es segura (fully qualified o relativa), false si es protocol-relative
 */
export function isValidUrl(url: string): boolean {
  // Rechazar URLs protocol-relative (empiezan con //)
  if (url.startsWith('//')) {
    console.error('[env] URL protocol-relative detectada (vulnerable a XSRF token leak):', url);
    return false;
  }
  // Aceptar URLs fully qualified (http:// o https://) o relativas (empiezan con /)
  return true;
}

/**
 * Detecta el entorno y retorna la URL base del API.
 * 
 * En Render: usa el backend de Render (taskforge-ufzf.onrender.com)
 * En desarrollo local: usa localhost:4000
 * 
 * IMPORTANTE: Siempre retorna URLs fully qualified (http:// o https://) para prevenir
 * vulnerabilidades de XSRF token leak con protocol-relative URLs.
 */
export const API_BASE = ((): string => {
  try {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // Si estamos en Render (cualquier subdominio de onrender.com)
    if (hostname.endsWith('.onrender.com')) {
      // En Render, el backend está en taskforge-ufzf.onrender.com
      const url = 'https://taskforge-ufzf.onrender.com';
      if (!isValidUrl(url)) {
        throw new Error('URL inválida generada');
      }
      return url;
    }
    
    // Si estamos en localhost (desarrollo local)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      const url = 'http://localhost:4000';
      if (!isValidUrl(url)) {
        throw new Error('URL inválida generada');
      }
      return url;
    }
  } catch (error) {
    // Si hay error accediendo a window.location, usar localhost por defecto
    console.warn('[env] Error detectando entorno, usando localhost:', error);
    const url = 'http://localhost:4000';
    if (!isValidUrl(url)) {
      throw new Error('URL por defecto inválida');
    }
    return url;
  }
  
  // Por defecto, desarrollo local
  const url = 'http://localhost:4000';
  if (!isValidUrl(url)) {
    throw new Error('URL por defecto inválida');
  }
  return url;
})();

/**
 * URL del servidor Socket.io (mismo host que API_BASE)
 */
export const SOCKET_URL = API_BASE;

/**
 * Verifica si estamos en modo de desarrollo.
 * Retorna true si estamos en localhost o si no estamos en producción.
 */
export const isDevelopment = (): boolean => {
  try {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  } catch {
    return false;
  }
};


