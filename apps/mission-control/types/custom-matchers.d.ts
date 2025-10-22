import '@testing-library/jest-dom';
import 'jest-axe/extend-expect';

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveNoViolations(): R;
      toBeTruthy(): R;
      toHaveLength(expected: number): R;
    }
  }
}

export {};
