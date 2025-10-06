"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROTOCOL_REVEAL_WINDOW_SECONDS = exports.PROTOCOL_REVEAL_WINDOW = exports.PROTOCOL_COMMIT_WINDOW_SECONDS = exports.PROTOCOL_COMMIT_WINDOW = exports.PROTOCOL_REQUIRED_APPROVALS = exports.PROTOCOL_VALIDATORS_PER_JOB = exports.PROTOCOL_TREASURY = exports.PROTOCOL_BURN_PCT_BASIS_POINTS = exports.PROTOCOL_BURN_PCT_PERCENT = exports.PROTOCOL_BURN_PCT = exports.PROTOCOL_FEE_PCT_BASIS_POINTS = exports.PROTOCOL_FEE_PCT_PERCENT = exports.PROTOCOL_FEE_PCT = exports.AGIALPHA_NAME = exports.AGIALPHA_SYMBOL = exports.AGIALPHA_DECIMALS = exports.AGIALPHA = void 0;
var config_1 = require("./config");
var protocol_defaults_1 = require("./generated/protocol-defaults");
var _a = (0, config_1.loadTokenConfig)().config, address = _a.address, decimals = _a.decimals, symbol = _a.symbol, name = _a.name;
// Canonical $AGIALPHA token address on Ethereum mainnet.
exports.AGIALPHA = address;
// Standard decimals for $AGIALPHA.
exports.AGIALPHA_DECIMALS = decimals;
// ERC-20 symbol for $AGIALPHA.
exports.AGIALPHA_SYMBOL = symbol;
// ERC-20 name for $AGIALPHA.
exports.AGIALPHA_NAME = name;
exports.PROTOCOL_FEE_PCT = protocol_defaults_1.PROTOCOL_DEFAULTS.feePct;
exports.PROTOCOL_FEE_PCT_PERCENT = protocol_defaults_1.PROTOCOL_DEFAULTS.feePctPercent;
exports.PROTOCOL_FEE_PCT_BASIS_POINTS = protocol_defaults_1.PROTOCOL_DEFAULTS.feePctBasisPoints;
exports.PROTOCOL_BURN_PCT = protocol_defaults_1.PROTOCOL_DEFAULTS.burnPct;
exports.PROTOCOL_BURN_PCT_PERCENT = protocol_defaults_1.PROTOCOL_DEFAULTS.burnPctPercent;
exports.PROTOCOL_BURN_PCT_BASIS_POINTS = protocol_defaults_1.PROTOCOL_DEFAULTS.burnPctBasisPoints;
exports.PROTOCOL_TREASURY = protocol_defaults_1.PROTOCOL_DEFAULTS.treasury;
exports.PROTOCOL_VALIDATORS_PER_JOB = protocol_defaults_1.PROTOCOL_DEFAULTS.validatorsPerJob;
exports.PROTOCOL_REQUIRED_APPROVALS = protocol_defaults_1.PROTOCOL_DEFAULTS.requiredApprovals;
exports.PROTOCOL_COMMIT_WINDOW = protocol_defaults_1.PROTOCOL_DEFAULTS.commitWindow;
exports.PROTOCOL_COMMIT_WINDOW_SECONDS = protocol_defaults_1.PROTOCOL_DEFAULTS.commitWindowSeconds;
exports.PROTOCOL_REVEAL_WINDOW = protocol_defaults_1.PROTOCOL_DEFAULTS.revealWindow;
exports.PROTOCOL_REVEAL_WINDOW_SECONDS = protocol_defaults_1.PROTOCOL_DEFAULTS.revealWindowSeconds;
