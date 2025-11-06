import '@testing-library/jest-dom';
import 'whatwg-fetch';
import { webcrypto, randomUUID } from 'crypto';

type CryptoWithOverrides = Crypto & {
  randomUUID?: () => string;
};

const cryptoObj: CryptoWithOverrides =
  (globalThis.crypto as CryptoWithOverrides | undefined) ??
  (webcrypto as unknown as CryptoWithOverrides);

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: cryptoObj,
    configurable: true,
  });
}

if (!cryptoObj.randomUUID) {
  cryptoObj.randomUUID = randomUUID;
}

if (!cryptoObj.getRandomValues) {
  cryptoObj.getRandomValues = (
    array: ArrayBufferView | null
  ): ArrayBufferView => {
    if (!array) {
      throw new TypeError('Expected a typed array for getRandomValues');
    }
    return webcrypto.getRandomValues(array);
  };
}
