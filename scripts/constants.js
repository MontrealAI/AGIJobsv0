'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AGIALPHA_NAME =
  exports.AGIALPHA_SYMBOL =
  exports.AGIALPHA_DECIMALS =
  exports.AGIALPHA =
    void 0;
var fs = require('fs');
var path = require('path');
var configPath = path.join(__dirname, '..', 'config', 'agialpha.json');
var _a = JSON.parse(fs.readFileSync(configPath, 'utf8')),
  address = _a.address,
  decimals = _a.decimals,
  symbol = _a.symbol,
  name = _a.name;
// Canonical $AGIALPHA token address on Ethereum mainnet.
exports.AGIALPHA = address;
// Standard decimals for $AGIALPHA.
exports.AGIALPHA_DECIMALS = decimals;
// ERC-20 symbol for $AGIALPHA.
exports.AGIALPHA_SYMBOL = symbol;
// ERC-20 name for $AGIALPHA.
exports.AGIALPHA_NAME = name;
