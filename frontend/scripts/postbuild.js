#!/usr/bin/env node

/**
 * Script post-build para asegurar que el archivo static.json esté en la raíz
 * del directorio de publicación para Render.
 * 
 * Render requiere static.json para configurar las redirecciones de SPA.
 * Este archivo redirige todas las rutas a index.html para que Angular
 * pueda manejar el enrutamiento del lado del cliente.
 */

const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'taskforge-ui', 'browser');
const staticJsonSource = path.join(__dirname, '..', 'public', 'static.json');
const staticJsonDest = path.join(distPath, 'static.json');

// Crear directorio si no existe
if (!fs.existsSync(distPath)) {
  console.error('❌ Directorio de salida no encontrado:', distPath);
  process.exit(1);
}

// Copiar static.json si existe
if (fs.existsSync(staticJsonSource)) {
  fs.copyFileSync(staticJsonSource, staticJsonDest);
  console.log('✓ static.json copiado a:', staticJsonDest);
} else {
  console.warn('⚠️  Archivo static.json no encontrado en:', staticJsonSource);
  console.warn('   Render requiere static.json para manejar rutas SPA');
}

