import type { Request, Response, NextFunction } from 'express';
import { getCorsOrigin, getAllowedOrigins } from '../utils/cors-config';

/**
 * Middleware personalizado de CORS usando Express
 * Asegura que los headers CORS se envíen en todas las respuestas,
 * incluyendo errores 404 y respuestas de error
 * 
 * En desarrollo: permite automáticamente localhost:4200, localhost:3000, etc.
 * En producción: solo permite orígenes configurados en CLIENT_ORIGIN
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const corsOrigin = getCorsOrigin(origin);

  // Logging solo en desarrollo para no saturar logs en producción
  if (process.env.NODE_ENV !== 'production') {
    if (!corsOrigin && origin) {
      const allowedOrigins = getAllowedOrigins();
      // eslint-disable-next-line no-console
      console.warn(`[CORS] Rechazando Origin: ${origin}; Permitidos: [${allowedOrigins.join(', ')}]; Method: ${req.method}; Path: ${req.path}`);
    }
  }

  // SIEMPRE establecer los headers CORS - esto es crítico
  // Esto asegura que incluso si hay un error, los headers CORS se envíen
  if (corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-User-Email');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
  
  // Asegurar que los headers se envíen incluso en errores
  // Esto es importante para que el navegador no bloquee las respuestas de error
  res.on('finish', () => {
    if (corsOrigin && !res.getHeader('Access-Control-Allow-Origin')) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    }
  });
  
  // Manejar preflight (OPTIONS) - responder inmediatamente
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
}
