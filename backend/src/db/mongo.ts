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
  await mongoose.connect(effectiveUri);
  // eslint-disable-next-line no-console
  console.log('✅ MongoDB conectado exitosamente');
  
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


