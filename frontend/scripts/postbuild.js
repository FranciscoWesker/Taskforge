#!/usr/bin/env node

/**
 * Script post-build para asegurar que los archivos de redirección estén en la raíz
 * del directorio de publicación para Render.
 * 
 * Render requiere static.json para configurar las redirecciones de SPA.
 * También copiamos _redirects por compatibilidad con otras plataformas.
 * Estos archivos redirigen todas las rutas a index.html para que Angular
 * pueda manejar el enrutamiento del lado del cliente.
 */

const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'taskforge-ui', 'browser');
const publicPath = path.join(__dirname, '..', 'public');

// Archivos a copiar
const filesToCopy = [
  { source: 'static.json', dest: 'static.json' },
  { source: '_redirects', dest: '_redirects' }
];

// Crear directorio si no existe
if (!fs.existsSync(distPath)) {
  console.error('❌ Directorio de salida no encontrado:', distPath);
  process.exit(1);
}

// Copiar archivos de redirección
let copiedCount = 0;
for (const file of filesToCopy) {
  const sourcePath = path.join(publicPath, file.source);
  const destPath = path.join(distPath, file.dest);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✓ ${file.source} copiado a:`, destPath);
    copiedCount++;
  } else {
    console.warn(`⚠️  Archivo ${file.source} no encontrado en:`, sourcePath);
  }
}

if (copiedCount === 0) {
  console.error('❌ No se encontraron archivos de redirección. Render requiere static.json para manejar rutas SPA.');
  process.exit(1);
}

