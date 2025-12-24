#!/usr/bin/env node

const path = require("path");
const { register } = require("ts-node");

register({ compilerOptions: { module: "commonjs" }, transpileOnly: true });
require(path.join(__dirname, "scripts", "run-kardashev-demo.ts"));
