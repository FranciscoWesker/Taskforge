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
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('⚠️  ADVERTENCIA: Usando MongoDB en memoria. Los datos se perderán al reiniciar el servidor.');
    }
    try {
      memoryServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'taskforge',
        },
      });
      effectiveUri = memoryServer.getUri();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error iniciando MongoDB en memoria:', err);
      throw err;
    }
  }
  
  try {
    await mongoose.connect(effectiveUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
  } catch (error: any) {
    // Solo mostrar errores en producción, siempre loguear errores críticos
    // eslint-disable-next-line no-console
    console.error('Error conectando a MongoDB:', error.message || error);
    if (error.message && (error.message.includes('whitelist') || error.message.includes('IP') || error.message.includes('could not connect'))) {
      // eslint-disable-next-line no-console
      console.error('Configura la whitelist de MongoDB Atlas en Network Access');
    }
    throw error;
  }
  
  // Solo mostrar eventos de conexión en desarrollo
  if (process.env.NODE_ENV !== 'production') {
    mongoose.connection.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Error de conexión MongoDB:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      // eslint-disable-next-line no-console
      console.warn('MongoDB desconectado');
    });
    
    mongoose.connection.on('reconnected', () => {
      // eslint-disable-next-line no-console
      console.log('MongoDB reconectado');
    });
  }
}


