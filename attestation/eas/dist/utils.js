"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalize = canonicalize;
exports.canonicalizeToJson = canonicalizeToJson;
exports.computeReceiptDigest = computeReceiptDigest;
exports.normalizeOptionalHex = normalizeOptionalHex;
exports.normalizeContext = normalizeContext;
const ethers_1 = require("ethers");
function normalizeValue(value) {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === "bigint") {
        return `bigint:${value.toString()}`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        if (!Number.isFinite(value)) {
            return String(value);
        }
        return value;
    }
    if (typeof value === "string") {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof Uint8Array) {
        return ethers_1.ethers.hexlify(value);
    }
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeValue(entry));
    }
    if (value instanceof Map) {
        const entries = Array.from(value.entries()).map(([key, val]) => ({
            key: String(key),
            value: normalizeValue(val),
        }));
        entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        return entries;
    }
    if (value instanceof Set) {
        const entries = Array.from(value.values()).map((entry) => normalizeValue(entry));
        entries.sort();
        return entries;
    }
    if (typeof value === "object") {
        const candidate = value;
        if (typeof candidate.toJSON === "function") {
            try {
                return normalizeValue(candidate.toJSON());
            }
            catch (error) {
                return String(error);
            }
        }
        const entries = Object.entries(candidate)
            .map(([key, val]) => [key, normalizeValue(val)])
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        const normalized = {};
        for (const [key, val] of entries) {
            normalized[key] = val;
        }
        return normalized;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return String(value);
    }
}
function canonicalize(value) {
    return normalizeValue(value);
}
function canonicalizeToJson(value) {
    const normalized = canonicalize(value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== undefined) {
        return serialized;
    }
    return JSON.stringify(String(value ?? ""));
}
function computeReceiptDigest(payload) {
    const canonical = canonicalizeToJson(payload);
    return ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(canonical));
}
function normalizeOptionalHex(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        return ethers_1.ethers.getBytes(trimmed).length ? ethers_1.ethers.hexlify(trimmed) : trimmed;
    }
    catch {
        return trimmed;
    }
}
function normalizeContext(context) {
    if (!context) {
        return undefined;
    }
    const canonical = canonicalizeToJson(context);
    return canonical === "null" ? undefined : canonical;
}
