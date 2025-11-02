/**
 * Utilidades para validación y sanitización de entrada de usuario.
 * Previene ataques de inyección, XSS y otros vectores de ataque.
 */

/**
 * Valida que un email tenga formato válido.
 * @param email - Email a validar
 * @returns true si el email es válido, false en caso contrario
 */
export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string' || email.length === 0 || email.length > 254) {
    return false;
  }
  // RFC 5322 simplified email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.toLowerCase().trim());
}

/**
 * Sanitiza un string para prevenir XSS e inyección.
 * @param input - String a sanitizar
 * @param maxLength - Longitud máxima permitida (default: 5000)
 * @returns String sanitizado
 */
export function sanitizeString(input: unknown, maxLength = 5000): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remover caracteres de control y normalizar espacios
  let sanitized = input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remover caracteres de control
    .replace(/\s+/g, ' ') // Normalizar espacios múltiples
    .trim();
  
  // Limitar longitud
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

/**
 * Valida y sanitiza el nombre de un tablero.
 * @param name - Nombre del tablero
 * @returns Nombre sanitizado o null si es inválido
 */
export function validateBoardName(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  
  const sanitized = sanitizeString(name, 100);
  
  // Validar longitud mínima y máxima
  if (sanitized.length < 3 || sanitized.length > 100) {
    return null;
  }
  
  // No permitir solo espacios o caracteres especiales
  if (!/^[\w\s\-_áéíóúñÁÉÍÓÚÑ]+$/u.test(sanitized)) {
    return null;
  }
  
  return sanitized;
}

/**
 * Valida y sanitiza el título de una tarjeta.
 * @param title - Título de la tarjeta
 * @returns Título sanitizado o null si es inválido
 */
export function validateCardTitle(title: unknown): string | null {
  if (typeof title !== 'string') {
    return null;
  }
  
  const sanitized = sanitizeString(title, 200);
  
  // Validar longitud mínima y máxima
  if (sanitized.length === 0 || sanitized.length > 200) {
    return null;
  }
  
  return sanitized;
}

/**
 * Valida y sanitiza la descripción de una tarjeta.
 * @param description - Descripción de la tarjeta
 * @returns Descripción sanitizada o null si es inválido
 */
export function validateCardDescription(description: unknown): string | null {
  if (description === undefined || description === null) {
    return null; // null es válido (campo opcional)
  }
  
  if (typeof description !== 'string') {
    return null;
  }
  
  const sanitized = sanitizeString(description, 5000);
  
  // Longitud máxima pero puede estar vacío
  if (sanitized.length > 5000) {
    return null;
  }
  
  return sanitized || null;
}

/**
 * Valida un ID de board (UUID v4).
 * @param boardId - ID del tablero
 * @returns true si es un UUID válido, false en caso contrario
 */
export function isValidBoardId(boardId: unknown): boolean {
  if (typeof boardId !== 'string') {
    return false;
  }
  
  // UUID v4 pattern
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(boardId);
}

/**
 * Valida un ID de tarjeta (UUID o formato card-xxx).
 * @param cardId - ID de la tarjeta
 * @returns true si es válido, false en caso contrario
 */
export function isValidCardId(cardId: unknown): boolean {
  if (typeof cardId !== 'string') {
    return false;
  }
  
  // UUID o formato como card-xxx, pr-xxx
  const idRegex = /^[a-z0-9-]{1,100}$/i;
  return idRegex.test(cardId) && cardId.length <= 100;
}

/**
 * Valida que un array de emails contenga solo emails válidos.
 * @param emails - Array de emails
 * @returns true si todos son válidos, false en caso contrario
 */
export function validateEmailArray(emails: unknown): boolean {
  if (!Array.isArray(emails)) {
    return false;
  }
  
  if (emails.length > 50) { // Límite razonable
    return false;
  }
  
  return emails.every(email => typeof email === 'string' && isValidEmail(email));
}

/**
 * Valida límites WIP (Work In Progress).
 * @param limits - Objeto con límites WIP
 * @returns true si son válidos, false en caso contrario
 */
export function validateWipLimits(limits: unknown): boolean {
  if (typeof limits !== 'object' || limits === null) {
    return false;
  }
  
  const wip = limits as Record<string, unknown>;
  
  if (!('todo' in wip) || !('doing' in wip) || !('done' in wip)) {
    return false;
  }
  
  const todo = typeof wip.todo === 'number' ? wip.todo : -1;
  const doing = typeof wip.doing === 'number' ? wip.doing : -1;
  const done = typeof wip.done === 'number' ? wip.done : -1;
  
  // Validar rango razonable (1-999)
  return (
    todo >= 1 && todo <= 999 &&
    doing >= 1 && doing <= 999 &&
    done >= 1 && done <= 999
  );
}

/**
 * Valida un mapeo de ramas a columnas.
 * @param branchMapping - Array de mapeos
 * @returns true si es válido, false en caso contrario
 */
export function validateBranchMapping(branchMapping: unknown): boolean {
  if (!Array.isArray(branchMapping)) {
    return false;
  }
  
  if (branchMapping.length > 100) { // Límite razonable
    return false;
  }
  
  const validColumns = ['todo', 'doing', 'done'];
  
  return branchMapping.every((mapping: unknown) => {
    if (typeof mapping !== 'object' || mapping === null) {
      return false;
    }
    
    const m = mapping as Record<string, unknown>;
    
    if (!('branch' in m) || !('column' in m)) {
      return false;
    }
    
    if (typeof m.branch !== 'string' || m.branch.length === 0 || m.branch.length > 255) {
      return false;
    }
    
    if (!validColumns.includes(m.column as string)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Valida y sanitiza el nombre de un label.
 * @param name - Nombre del label
 * @returns Nombre sanitizado o null si es inválido
 */
export function validateLabelName(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  
  const sanitized = sanitizeString(name, 50);
  
  // Validar longitud mínima y máxima
  if (sanitized.length < 1 || sanitized.length > 50) {
    return null;
  }
  
  return sanitized;
}

/**
 * Valida un color hexadecimal (#rrggbb).
 * @param color - Color en formato hex
 * @returns true si es válido, false en caso contrario
 */
export function isValidColor(color: unknown): boolean {
  if (typeof color !== 'string') {
    return false;
  }
  
  // Formato hex: #rrggbb (6 dígitos hexadecimales)
  const colorRegex = /^#[0-9A-Fa-f]{6}$/;
  return colorRegex.test(color);
}

