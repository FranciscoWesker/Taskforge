import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guard que redirige al último tablero visitado cuando el usuario accede a /app/boards
 * sin un ID específico. Esto permite que al recargar la página, el usuario permanezca
 * en el mismo tablero en lugar de volver a la lista de tableros.
 */
export const lastBoardRedirectGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Solo aplicar si el usuario está autenticado
  if (!auth.isAuthenticated()) {
    return true; // Dejar que authGuard maneje la redirección
  }

  // Verificar si estamos en la ruta /app/boards sin ID específico
  // La ruta debe ser exactamente 'boards' sin parámetros
  // En una ruta sin parámetros, route.params estará vacío y route.paramMap no tendrá 'id'
  const isBoardsListRoute = 
    route.routeConfig?.path === 'boards' && 
    Object.keys(route.params).length === 0 &&
    !route.paramMap.has('id');

  if (isBoardsListRoute) {
    try {
      const lastBoardId = localStorage.getItem('tf-last-board');

      // Si hay un último tablero guardado y es un UUID válido, redirigir a él
      if (lastBoardId && lastBoardId !== 'demo' && isValidUUID(lastBoardId)) {
        router.navigate(['/app/boards', lastBoardId], { replaceUrl: true });
        return false; // Prevenir la carga del componente de lista
      }
    } catch (err) {
      // Si hay error al acceder a localStorage, continuar normalmente
      console.warn('Error al verificar último tablero:', err);
    }
  }

  // Permitir acceso normal si no hay redirección
  return true;
};

/**
 * Valida que una cadena sea un UUID válido en formato estándar.
 * @param uuid - Cadena a validar
 * @returns true si es un UUID válido, false en caso contrario
 */
function isValidUUID(uuid: string): boolean {
  // Validar formato UUID básico (8-4-4-4-12 caracteres hexadecimales)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

