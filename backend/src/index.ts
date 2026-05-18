import express from 'express';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { testConnection } from './db';
import authRoutes from './routes/auth';
import postsRoutes from './routes/posts';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

app.use(express.json({limit: '5mb'}));
app.use(express.urlencoded({extended: true}));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'interest-cohort=()');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);

const FRONTEND = path.join(__dirname, '../../frontend');
app.use(express.static(FRONTEND));

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

async function main() {
  try {
    await testConnection();
    app.listen(PORT, '0.0.0.0', () => {
      // Detect LAN IP inline
      let localIP = 'YOUR_IP';
      for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const iface of ifaces ?? []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIP = iface.address;
            break;
          }
        }
      }
      console.log('📖BlogTell is running!');
      console.log(`Local   →  http://localhost:${PORT}`);
      console.log(`Network →  http://${localIP}:${PORT}`);
      console.log('Share the network URL with anyone on your Wi-fi to let them access to your blog!');
    });
  } catch (err) {
    console.error('Failed to start BlogTell:', err);
    process.exit(1);
  }
}

main();