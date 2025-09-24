"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGIALPHA_NAME = exports.AGIALPHA_SYMBOL = exports.AGIALPHA_DECIMALS = exports.AGIALPHA = void 0;
var config_1 = require("./config");
var _a = (0, config_1.loadTokenConfig)().config, address = _a.address, decimals = _a.decimals, symbol = _a.symbol, name = _a.name;
// Canonical $AGIALPHA token address on Ethereum mainnet.
exports.AGIALPHA = address;
// Standard decimals for $AGIALPHA.
exports.AGIALPHA_DECIMALS = decimals;
// ERC-20 symbol for $AGIALPHA.
exports.AGIALPHA_SYMBOL = symbol;
// ERC-20 name for $AGIALPHA.
exports.AGIALPHA_NAME = name;
