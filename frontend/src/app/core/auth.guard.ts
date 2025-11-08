import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Auth } from '@angular/fire/auth';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const firebaseAuth = inject(Auth);
  
  // Esperar a que Firebase verifique el estado de autenticación
  // Esto es importante al recargar la página
  try {
    // Esperar a que el estado de autenticación se inicialice
    await new Promise<void>((resolve) => {
      const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
        unsubscribe();
        resolve();
      });
    });
    
    // Verificar si el usuario está autenticado después de que Firebase haya verificado
    if (!auth.isAuthenticated()) {
      router.navigate(['/login']);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error verificando autenticación:', error);
    router.navigate(['/login']);
    return false;
  }
};


