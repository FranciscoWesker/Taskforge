import http from 'http';
import dotenv from 'dotenv';
import { createApp } from './app';
import { createSocketServer } from './socket/index';
import { connectMongo } from './db/mongo';
import { setIo } from './socket/bus';

dotenv.config();

async function bootstrap(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);
  setIo(io);

  const port = Number(process.env.PORT || 4000);
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskforge';
  
  // Conectar a MongoDB (no bloquear inicio del servidor)
  connectMongo(mongoUri).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Error conectando a MongoDB (el servidor seguirá funcionando):', err);
  });

  server.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`API escuchando en http://0.0.0.0:${port}`);
    // eslint-disable-next-line no-console
    console.log(`CLIENT_ORIGIN: ${process.env.CLIENT_ORIGIN || 'no configurado'}`);
    // eslint-disable-next-line no-console
    console.log(`USE_MEM_MONGO: ${process.env.USE_MEM_MONGO || 'false'}`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error al iniciar el servidor', err);
  process.exit(1);
});


