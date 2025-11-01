/**
 * Middleware de autorización para verificar permisos de acceso a recursos.
 * Implementa control de acceso basado en roles (owner, member, public).
 */

import type { Request, Response, NextFunction } from 'express';
import { BoardStateModel } from '../db/board-state.model';
import { IntegrationModel } from '../db/integration.model';

/**
 * Valida el formato de un email de forma segura sin problemas de ReDoS.
 * Usa una validación simple basada en división de strings en lugar de regex compleja.
 * @param email - Email a validar
 * @returns true si el email tiene un formato válido básico
 */
function isValidEmail(email: string): boolean {
  // Limitar longitud máxima (RFC 5321)
  if (email.length > 254) {
    return false;
  }
  
  // Dividir por @ en lugar de usar regex
  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }
  
  const [local, domain] = parts;
  
  // Validar parte local (antes del @)
  if (!local || local.length === 0 || local.length > 64) {
    return false;
  }
  
  // Validar dominio (después del @)
  if (!domain || domain.length === 0) {
    return false;
  }
  
  // Verificar que el dominio tenga al menos un punto
  const domainParts = domain.split('.');
  if (domainParts.length < 2) {
    return false;
  }
  
  // Verificar que la última parte del dominio tenga al menos 2 caracteres
  const lastPart = domainParts[domainParts.length - 1];
  if (!lastPart || lastPart.length < 2) {
    return false;
  }
  
  return true;
}

/**
 * Extrae el email del usuario desde los headers de la solicitud.
 * En producción, esto debería venir de un token JWT validado.
 * @param req - Request de Express
 * @returns Email del usuario o null si no está presente
 */
function getUserEmail(req: Request): string | null {
  // En desarrollo: usar header personalizado 'X-User-Email'
  // En producción: debería extraerse de un JWT token validado
  const email = req.headers['x-user-email'] as string | undefined;
  
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  const trimmedEmail = email.toLowerCase().trim();
  
  // Validar formato de email de forma segura
  if (!isValidEmail(trimmedEmail)) {
    return null;
  }
  
  return trimmedEmail;
}

/**
 * Verifica si un usuario tiene acceso a un tablero.
 * @param boardId - ID del tablero
 * @param userEmail - Email del usuario
 * @returns Objeto con información de acceso: { hasAccess: boolean, isOwner: boolean, isMember: boolean }
 */
async function checkBoardAccess(boardId: string, userEmail: string | null): Promise<{
  hasAccess: boolean;
  isOwner: boolean;
  isMember: boolean;
  board: any;
}> {
  if (!userEmail) {
    return { hasAccess: false, isOwner: false, isMember: false, board: null };
  }
  
  const board = await BoardStateModel.findOne({ boardId }).lean();
  
  if (!board) {
    return { hasAccess: false, isOwner: false, isMember: false, board: null };
  }
  
  const isOwner = board.owner === userEmail;
  const isMember = (board.members || []).includes(userEmail);
  const hasAccess = isOwner || isMember;
  
  return { hasAccess, isOwner, isMember, board };
}

/**
 * Middleware que verifica que el usuario tenga acceso al tablero (owner o member).
 * Solo permite acceso si el usuario es dueño o miembro del tablero.
 */
export async function requireBoardAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { boardId } = req.params;
    
    if (!boardId || typeof boardId !== 'string') {
      res.status(400).json({ error: 'bad_request', message: 'boardId requerido' });
      return;
    }
    
    const userEmail = getUserEmail(req);
    
    if (!userEmail) {
      res.status(401).json({ error: 'unauthorized', message: 'Email de usuario requerido' });
      return;
    }
    
    const { hasAccess, board } = await checkBoardAccess(boardId, userEmail);
    
    if (!hasAccess || !board) {
      res.status(403).json({ error: 'forbidden', message: 'No tienes acceso a este tablero' });
      return;
    }
    
    // Agregar información de acceso al request para uso posterior
    (req as any).board = board;
    (req as any).userEmail = userEmail;
    (req as any).isOwner = board.owner === userEmail;
    
    next();
  } catch (err) {
    console.error('[Authorization] Error verificando acceso:', err);
    res.status(500).json({ error: 'internal_error', message: 'Error verificando permisos' });
  }
}

/**
 * Middleware que verifica que el usuario sea dueño del tablero.
 * Solo permite acceso si el usuario es el dueño del tablero.
 */
export async function requireBoardOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { boardId } = req.params;
    
    if (!boardId || typeof boardId !== 'string') {
      res.status(400).json({ error: 'bad_request', message: 'boardId requerido' });
      return;
    }
    
    const userEmail = getUserEmail(req);
    
    if (!userEmail) {
      res.status(401).json({ error: 'unauthorized', message: 'Email de usuario requerido' });
      return;
    }
    
    const { isOwner, board } = await checkBoardAccess(boardId, userEmail);
    
    if (!isOwner || !board) {
      res.status(403).json({ error: 'forbidden', message: 'Solo el dueño puede realizar esta acción' });
      return;
    }
    
    // Agregar información de acceso al request para uso posterior
    (req as any).board = board;
    (req as any).userEmail = userEmail;
    (req as any).isOwner = true;
    
    next();
  } catch (err) {
    console.error('[Authorization] Error verificando propiedad:', err);
    res.status(500).json({ error: 'internal_error', message: 'Error verificando permisos' });
  }
}

/**
 * Middleware que verifica que el usuario tenga acceso a una integración.
 * Solo permite acceso si el usuario es dueño del tablero asociado.
 */
export async function requireIntegrationAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { integrationId } = req.params;
    
    if (!integrationId || typeof integrationId !== 'string') {
      res.status(400).json({ error: 'bad_request', message: 'integrationId requerido' });
      return;
    }
    
    const userEmail = getUserEmail(req);
    
    if (!userEmail) {
      res.status(401).json({ error: 'unauthorized', message: 'Email de usuario requerido' });
      return;
    }
    
    const integration = await IntegrationModel.findOne({ integrationId }).lean();
    
    if (!integration) {
      res.status(404).json({ error: 'integration_not_found', message: 'Integración no encontrada' });
      return;
    }
    
    const board = await BoardStateModel.findOne({ boardId: integration.boardId }).lean();
    
    if (!board || board.owner !== userEmail) {
      res.status(403).json({ error: 'forbidden', message: 'No tienes acceso a esta integración' });
      return;
    }
    
    // Agregar información al request
    (req as any).integration = integration;
    (req as any).board = board;
    (req as any).userEmail = userEmail;
    (req as any).isOwner = true;
    
    next();
  } catch (err) {
    console.error('[Authorization] Error verificando acceso a integración:', err);
    res.status(500).json({ error: 'internal_error', message: 'Error verificando permisos' });
  }
}

