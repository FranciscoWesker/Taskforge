import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer: MongoMemoryServer | null = null;

/**
 * Verifica si MongoDB está conectado y listo para usar.
 */
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1; // 1 = connected
}

/**
 * Conecta a MongoDB (real o en memoria según configuración).
 */
export async function connectMongo(uri: string): Promise<void> {
  let effectiveUri = uri;
  const useMemory = process.env.USE_MEM_MONGO === 'true';
  if (useMemory) {
    // eslint-disable-next-line no-console
    console.log('⚠️  ADVERTENCIA: Usando MongoDB en memoria. Los datos se perderán al reiniciar el servidor.');
    // eslint-disable-next-line no-console
    console.log('Iniciando MongoDB en memoria...');
    try {
      memoryServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'taskforge',
        },
      });
      effectiveUri = memoryServer.getUri();
      // eslint-disable-next-line no-console
      console.log(`MongoDB en memoria iniciado: ${effectiveUri}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error iniciando MongoDB en memoria:', err);
      throw err;
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(`Conectando a MongoDB real: ${effectiveUri.replace(/\/\/.*@/, '//***:***@')}`); // Ocultar credenciales en logs
  }
  // eslint-disable-next-line no-console
  console.log(`Conectando a MongoDB...`);
  try {
    await mongoose.connect(effectiveUri, {
      serverSelectionTimeoutMS: 30000, // Timeout aumentado a 30 segundos
      socketTimeoutMS: 45000,
    });
    // eslint-disable-next-line no-console
    console.log('✅ MongoDB conectado exitosamente');
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('❌ Error conectando a MongoDB:', error.message || error);
    // Si es un error de whitelist/IP, dar instrucciones específicas
    if (error.message && (error.message.includes('whitelist') || error.message.includes('IP') || error.message.includes('could not connect'))) {
      // eslint-disable-next-line no-console
      console.error('');
      // eslint-disable-next-line no-console
      console.error('⚠️  IMPORTANTE: Configura la whitelist de MongoDB Atlas:');
      // eslint-disable-next-line no-console
      console.error('   1. Ve a MongoDB Atlas → Network Access → Add IP Address');
      // eslint-disable-next-line no-console
      console.error('   2. Agrega 0.0.0.0/0 (todas las IPs) para permitir conexiones desde Render');
      // eslint-disable-next-line no-console
      console.error('   3. O agrega la IP específica de Render si lo prefieres');
      // eslint-disable-next-line no-console
      console.error('');
    }
    throw error;
  }
  
  // Configurar listeners de eventos de conexión
  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('❌ Error de conexión MongoDB:', err);
  });
  
  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('⚠️  MongoDB desconectado');
  });
  
  mongoose.connection.on('reconnected', () => {
    // eslint-disable-next-line no-console
    console.log('✅ MongoDB reconectado');
  });
}


