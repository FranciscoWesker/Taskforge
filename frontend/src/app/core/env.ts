/**
 * Detecta el entorno y retorna la URL base del API.
 * 
 * En Render: usa el backend de Render (taskforge-ufzf.onrender.com)
 * En desarrollo local: usa localhost:4000
 */
export const API_BASE = ((): string => {
  try {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // Si estamos en Render (cualquier subdominio de onrender.com)
    if (hostname.endsWith('.onrender.com')) {
      // En Render, el backend está en taskforge-ufzf.onrender.com
      return 'https://taskforge-ufzf.onrender.com';
    }
    
    // Si estamos en localhost (desarrollo local)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return 'http://localhost:4000';
    }
  } catch (error) {
    // Si hay error accediendo a window.location, usar localhost por defecto
    console.warn('[env] Error detectando entorno, usando localhost:', error);
    return 'http://localhost:4000';
  }
  
  // Por defecto, desarrollo local
  return 'http://localhost:4000';
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


