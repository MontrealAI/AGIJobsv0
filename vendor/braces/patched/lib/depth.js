'use strict';

// Fixed rather than caller-controlled: options cannot disable the stack bound.
const MAX_DEPTH = 128;
const checkDepth = depth => {
  if (depth > MAX_DEPTH) {
    const error = new SyntaxError('Brace pattern or AST exceeds the supported nesting depth (128)');
    error.code = 'BRACES_MAX_DEPTH';
    throw error;
  }
};
module.exports = { MAX_DEPTH, checkDepth };
