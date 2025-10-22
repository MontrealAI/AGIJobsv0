import '@testing-library/jest-dom';
import 'whatwg-fetch';
import { configure } from '@testing-library/react';
import { expect } from '@jest/globals';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);
configure({ asyncUtilTimeout: 5000 });

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }))
});
