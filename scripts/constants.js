"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGIALPHA_DECIMALS = exports.AGIALPHA = void 0;
var fs = require("fs");
var path = require("path");
var configPath = path.join(__dirname, '..', 'config', 'agialpha.json');
var _a = JSON.parse(fs.readFileSync(configPath, 'utf8')), address = _a.address, decimals = _a.decimals;
// Canonical $AGIALPHA token address on Ethereum mainnet.
exports.AGIALPHA = address;
// Standard decimals for $AGIALPHA.
exports.AGIALPHA_DECIMALS = decimals;
