'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AGIALPHA_NAME =
  exports.AGIALPHA_SYMBOL =
  exports.AGIALPHA_DECIMALS =
  exports.AGIALPHA =
    void 0;
var loadConfig = require('./config').loadTokenConfig;
var _a = loadConfig(),
  _b = _a.config,
  address = _b.address,
  decimals = _b.decimals,
  symbol = _b.symbol,
  name = _b.name;
// Canonical $AGIALPHA token address on Ethereum mainnet.
exports.AGIALPHA = address;
// Standard decimals for $AGIALPHA.
exports.AGIALPHA_DECIMALS = decimals;
// ERC-20 symbol for $AGIALPHA.
exports.AGIALPHA_SYMBOL = symbol;
// ERC-20 name for $AGIALPHA.
exports.AGIALPHA_NAME = name;
