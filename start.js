const { spawn, execSync } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

console.log('==> Pushing Prisma schema to database...');
try {
  execSync('npx prisma db push --skip-generate', {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
  });
} catch (err) {
  console.error('Warning: prisma db push failed at startup:', err.message);
}

console.log('==> Starting Express backend on internal port 3001...');
const backend = spawn('node', ['dist/index.js'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3001',
  },
});

const publicPort = process.env.PORT || '3000';
console.log(`==> Starting Next.js frontend on public port ${publicPort}...`);
const frontend = spawn('npx', ['next', 'start', '-p', publicPort], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    BACKEND_INTERNAL_URL: 'http://127.0.0.1:3001',
  },
});

function shutdown(signal) {
  backend.kill(signal);
  frontend.kill(signal);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

backend.on('exit', (code) => {
  console.error(`Backend exited with code ${code}`);
  frontend.kill();
  process.exit(code || 1);
});

frontend.on('exit', (code) => {
  console.error(`Frontend exited with code ${code}`);
  backend.kill();
  process.exit(code || 1);
});
