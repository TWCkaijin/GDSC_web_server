const fs = require('fs');
const { execSync } = require('child_process');

const envConfig = fs.readFileSync('./src/.env', 'utf8')
  .split('\n')
  .filter(line => line && !line.startsWith('#'))
  .map(line => line.split('='))
  .reduce((acc, [key, value]) => {
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});

const setCommand = Object.entries(envConfig)
  .map(([key, value]) => execSync(`firebase functions:config:set web.${key}="${value}"`,{ stdio: 'inherit' }))

