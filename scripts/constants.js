const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'config', 'agialpha.json');
const { address, decimals } = JSON.parse(fs.readFileSync(configPath, 'utf8'));

module.exports = {
  AGIALPHA: address,
  AGIALPHA_DECIMALS: decimals,
};
