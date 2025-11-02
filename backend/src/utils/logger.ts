/**
 * Logger estructurado para la aplicación.
 * Proporciona logging consistente sin exponer información sensible.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Sanitiza datos sensibles antes de loguear.
 * @param data - Datos a sanitizar
 * @returns Datos sanitizados
 */
function sanitizeLogData(data: unknown): unknown {
  if (typeof data === 'string') {
    // Remover tokens y contraseñas comunes
    const sensitivePatterns = [
      /token["\s:=]+([a-zA-Z0-9_-]{20,})/gi,
      /password["\s:=]+([^\s"']+)/gi,
      /secret["\s:=]+([^\s"']+)/gi,
      /api[_-]?key["\s:=]+([^\s"']+)/gi,
    ];
    
    let sanitized = data;
    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, (match) => {
        return match.substring(0, match.length - 10) + '***';
      });
    }
    
    return sanitized;
  }
  
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'accessToken', 'webhookSecret'];
    
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '***';
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }
    
    return sanitized;
  }
  
  return data;
}

/**
 * Formatea un mensaje de log.
 */
function formatLog(level: LogLevel, message: string, context?: string, metadata?: Record<string, unknown>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && { context }),
    ...(metadata && { metadata: sanitizeLogData(metadata) as Record<string, unknown> })
  };
  
  // En desarrollo: formato legible
  if (process.env.NODE_ENV !== 'production') {
    const contextStr = context ? `[${context}] ` : '';
    const metaStr = metadata ? ` ${JSON.stringify(sanitizeLogData(metadata))}` : '';
    return `${entry.timestamp} ${level.toUpperCase()} ${contextStr}${message}${metaStr}`;
  }
  
  // En producción: JSON estructurado
  return JSON.stringify(entry);
}

/**
 * Logger estructurado para la aplicación.
 */
export const logger = {
  debug: (message: string, context?: string, metadata?: Record<string, unknown>): void => {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(formatLog('debug', message, context, metadata));
    }
  },
  
  info: (message: string, context?: string, metadata?: Record<string, unknown>): void => {
    // En producción solo loguear errores críticos, en desarrollo mostrar todo
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(formatLog('info', message, context, metadata));
    }
  },
  
  warn: (message: string, context?: string, metadata?: Record<string, unknown>): void => {
    // En producción solo loguear warnings importantes, en desarrollo mostrar todo
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(formatLog('warn', message, context, metadata));
    }
  },
  
  error: (message: string, error?: Error | unknown, context?: string, metadata?: Record<string, unknown>): void => {
    const errorMetadata: Record<string, unknown> = { ...metadata };
    
    if (error instanceof Error) {
      errorMetadata.error = {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    } else if (error) {
      errorMetadata.error = sanitizeLogData(error);
    }
    
    // eslint-disable-next-line no-console
    console.error(formatLog('error', message, context, errorMetadata));
  }
};

