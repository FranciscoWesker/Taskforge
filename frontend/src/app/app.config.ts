import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { TUI_ICON_RESOLVER, tuiIconResolverProvider } from '@taiga-ui/core';
import { routes } from './app.routes';

// Firebase configuration
// NOTA: Las credenciales de Firebase son públicas por diseño y seguras para uso en frontend
// Las reglas de seguridad se configuran en Firebase Console, no en las credenciales
const firebaseConfig = {
  apiKey: "AIzaSyC-AvIgcCSPg9ebc57kD-yYmiQjrm-ySvs",
  authDomain: "taskforge-6e052.firebaseapp.com",
  projectId: "taskforge-6e052",
  storageBucket: "taskforge-6e052.firebasestorage.app",
  messagingSenderId: "528124337135",
  appId: "1:528124337135:web:81a53505257661756a741a"
};

// Configurar resolver de iconos para mapear nombres de iconos a rutas SVG
// NOTA: Las rutas deben empezar con / para que sean absolutas desde la raíz del sitio
// Soporta tanto formato tuiIconX como @tui.x
const iconResolver = (icon: string): string => {
  // Normalizar nombre del icono: convertir @tui.x a tuiIconX, @tui.eye a tuiIconEye, etc.
  // Manejar casos especiales como @tui.circle-check -> tuiIconCircle-check (mantener guión)
  // IMPORTANTE: La primera letra después de cada guión debe ser minúscula para mantener consistencia
  const normalizedIcon = icon.startsWith('@tui.') 
    ? 'tuiIcon' + icon.slice(5).split('-').map((part, i) => {
        // Capitalizar primera letra de cada parte, pero mantener el resto como está
        // Esto preserva casos como circle-x donde 'x' debe permanecer minúscula
        return part.charAt(0).toUpperCase() + part.slice(1);
      }).join('-') // Mantener guiones para iconos compuestos
    : icon;
  
  // Normalizar adicional: asegurar que después de guión la primera letra sea minúscula
  // Ej: tuiIconCircle-X -> tuiIconCircle-x
  const finalIcon = normalizedIcon.replace(/-([A-Z])/g, (match, letter) => {
    return '-' + letter.toLowerCase();
  });

  // Usar finalIcon en lugar de normalizedIcon
  const iconMap: Record<string, string> = {
    'tuiIconMenu': 'menu.svg',
    'tuiIconSun': 'sun.svg',
    'tuiIconSunLarge': 'sun-filled.svg',
    'tuiIconMoon': 'sun-moon.svg',
    'tuiIconMoonLarge': 'sun-moon-filled.svg',
    'tuiIconLogOut': 'log-out.svg',
    'tuiIconLogOutLarge': 'log-out-filled.svg',
    'tuiIconGrid': 'grid.svg',
    'tuiIconGridLarge': 'grid-2x2-filled.svg',
    'tuiIconEdit': 'edit.svg',
    'tuiIconTrash': 'trash.svg',
    'tuiIconPlus': 'plus.svg',
    'tuiIconRefresh': 'refresh-cw.svg',
    'tuiIconSettings': 'settings.svg',
    'tuiIconCheck': 'check.svg',
    'tuiIconGoogle': 'google-pay.svg', // Usar google-pay si google no existe
    'tuiIconCode': 'code-2.svg',
    'tuiIconMessage': 'message-circle.svg',
    'tuiIconLogIn': 'log-in.svg',
    'tuiIconLogInLarge': 'log-in-filled.svg',
    'tuiIconX': 'x-circle.svg', // Icono X/cerrar
    'tuiIconEye': 'eye-filled.svg', // Icono ojo/ver
    'tuiIconGitBranch': 'git-branch.svg', // Icono rama Git
    'tuiIconClose': 'x-circle.svg', // Icono cerrar (igual que X)
    'tuiIconAlertCircle': 'alert-circle.svg', // Icono alerta
    'tuiIconChevronLeft': 'chevron-left.svg', // Icono flecha izquierda
    'tuiIconChevronRight': 'chevron-right.svg', // Icono flecha derecha
    'tuiIconCircle-check': 'circle-check.svg', // Icono check en círculo
    'tuiIconCircleCheck': 'circle-check.svg', // Variante sin guión
    'tuiIconCircle-x': 'circle-x.svg', // Icono X en círculo
    'tuiIconCircleX': 'circle-x.svg', // Variante sin guión
  };
  
  const fileName = iconMap[finalIcon];
  if (!fileName) {
    console.warn(`Icono no encontrado: ${icon} (normalizado: ${finalIcon})`);
    return '';
  }
  
  // Retornar ruta absoluta desde la raíz del sitio (importante para static_site en Render)
  return `/assets/taiga-ui/icons/${fileName}`;
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    tuiIconResolverProvider(iconResolver),
  ]
};
