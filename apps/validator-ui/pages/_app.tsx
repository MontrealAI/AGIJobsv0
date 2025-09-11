import type { AppProps } from 'next/app';
import { ErrorProvider } from '../lib/error';
import Toast from '../components/Toast';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorProvider>
      <Toast />
      <Component {...pageProps} />
    </ErrorProvider>
  );
}

