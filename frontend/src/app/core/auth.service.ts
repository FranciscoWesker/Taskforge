import { Injectable, signal, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, updateProfile } from '@angular/fire/auth';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  
  readonly isAuthenticated = signal<boolean>(false);
  readonly currentUser = signal<User | null>(null);

  constructor() {
    // Escuchar cambios en el estado de autenticación
    onAuthStateChanged(this.auth, (user) => {
      this.currentUser.set(user);
      this.isAuthenticated.set(!!user);
    });
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
      if (!email || !password) return false;
      await signInWithEmailAndPassword(this.auth, email, password);
      return true;
    } catch (error: any) {
      console.error('Error al iniciar sesión:', error);
      throw this.getAuthErrorMessage(error.code);
    }
  }

  async loginWithGoogle(): Promise<boolean> {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.auth, provider);
      return true;
    } catch (error: any) {
      console.error('Error al iniciar sesión con Google:', error);
      throw this.getAuthErrorMessage(error.code);
    }
  }

  async register(email: string, password: string, displayName?: string): Promise<boolean> {
    try {
      if (!email || !password) return false;
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      
      // Actualizar el nombre de usuario si se proporciona
      if (displayName && userCredential.user) {
        await updateProfile(userCredential.user, { displayName });
      }
      
      return true;
    } catch (error: any) {
      console.error('Error al registrar:', error);
      throw this.getAuthErrorMessage(error.code);
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      throw error;
    }
  }

  getDisplayName(): string | null {
    const user = this.currentUser();
    return user?.displayName || user?.email?.split('@')[0] || null;
  }

  getEmail(): string | null {
    return this.currentUser()?.email || null;
  }

  private getAuthErrorMessage(code: string): string {
    const errorMessages: { [key: string]: string } = {
      'auth/invalid-email': 'El correo electrónico no es válido.',
      'auth/user-disabled': 'Este usuario ha sido deshabilitado.',
      'auth/user-not-found': 'No se encontró una cuenta con este correo electrónico.',
      'auth/wrong-password': 'La contraseña es incorrecta.',
      'auth/email-already-in-use': 'Este correo electrónico ya está registrado.',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
      'auth/operation-not-allowed': 'Esta operación no está permitida.',
      'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta más tarde.',
      'auth/popup-closed-by-user': 'La ventana de autenticación fue cerrada.',
      'auth/cancelled-popup-request': 'Solo se puede abrir una ventana de autenticación a la vez.',
    };
    return errorMessages[code] || 'Ocurrió un error durante la autenticación. Intenta de nuevo.';
  }
}


