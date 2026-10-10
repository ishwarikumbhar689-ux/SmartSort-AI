const path = require('path');
const dns = require('node:dns');

dns.setDefaultResultOrder('ipv4first');


require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const app = require('./src/app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`SmartSort AI backend running on http://localhost:${PORT}`);
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY not set — /api/compare will return 503 until it is configured.');
  } else {
    
    const keyPrefix = process.env.GEMINI_API_KEY.slice(0, 6);
    console.log(`🔑 Loaded GEMINI_API_KEY starting with: ${keyPrefix}...`);
  }
});


server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Run 'npx kill-port ${PORT}' or pick a different port.`);
    process.exit(1);
  } else {
    throw err;
  }
});