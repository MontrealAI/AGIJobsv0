import { useError } from '../lib/error';

export default function Toast() {
  const { error, clearError } = useError();
  if (!error) return null;
  return (
    <div role="alert">
      <span>{error}</span>
      <button onClick={clearError}>Dismiss</button>
    </div>
  );
}

