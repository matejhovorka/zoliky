// Starts Žolíky with an instant public Cloudflare Tunnel (works through Eduroam, LTE, firewalls)
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const cloudflaredBin = path.join(rootDir, 'bin', 'cloudflared');

if (!fs.existsSync(cloudflaredBin)) {
  console.error('❌ Binárka cloudflared nebyla nalezena v složce bin.');
  process.exit(1);
}

// 1. Start Server
console.log('🚀 Spouštím herní server Žolíky...');
const serverProcess = spawn('node', ['server/index.js'], {
  cwd: rootDir,
  stdio: ['inherit', 'pipe', 'inherit']
});

serverProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
});

// 2. Start Cloudflare Tunnel
setTimeout(() => {
  console.log('\n🌐 Vytvářím veřejný zabezpečený odkaz pro školu (Eduroam)...');
  const tunnelProcess = spawn(cloudflaredBin, ['tunnel', '--url', 'http://localhost:3000'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let urlFound = false;

  const handleTunnelOutput = (chunk) => {
    const text = chunk.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !urlFound) {
      urlFound = true;
      const publicUrl = match[0];
      try {
        fs.writeFileSync(path.join(rootDir, 'public_url.txt'), publicUrl, 'utf8');
      } catch (e) {}
      console.log('\n=============================================================');
      console.log('🎉 ŽOLÍKY JSOU ONLINE! FUNGUJE I NA ŠKOLNÍM EDUROAMU:');
      console.log(`🔗 ODKAZ PRO KAMARÁDY: \x1b[1m\x1b[32m${publicUrl}\x1b[0m`);
      console.log('📱 Tento odkaz pošlete kamarádům na mobil, iPad nebo notebook!');
      console.log('=============================================================\n');
    }
  };

  tunnelProcess.stdout.on('data', handleTunnelOutput);
  tunnelProcess.stderr.on('data', handleTunnelOutput);

  const cleanup = () => {
    try {
      tunnelProcess.kill();
      serverProcess.kill();
    } catch (e) {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}, 1500);

