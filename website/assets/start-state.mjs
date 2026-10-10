const schema = 'agi-jobs-start/v1';
const maxTextLength = 16_384;
const fieldNames = ['step', 'role', 'type', 'goal', 'largeText'];

function exactObject(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false;
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.length &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, 'value');
    })
  );
}

function copyFields(value) {
  if (!exactObject(value, fieldNames))
    throw new Error('Saved progress must contain only the expected fields.');
  const { step, role, type, goal, largeText } = value;
  if (
    !Number.isInteger(step) ||
    step < 0 ||
    step > 2 ||
    !['', 'buyer', 'worker', 'reviewer', 'explorer'].includes(role) ||
    !['research', 'feature', 'tests'].includes(type) ||
    typeof goal !== 'string' ||
    goal.length > 2000 ||
    typeof largeText !== 'boolean' ||
    (step > 0 && role === '') ||
    (step === 2 && role === 'buyer' && goal.trim().length < 10)
  )
    throw new Error('Saved progress contains an invalid guide state.');
  return { step, role, type, goal, largeText };
}

export function saveStartProgress(state) {
  return JSON.stringify({ schema, fields: copyFields(state) });
}

export function openStartProgress(text) {
  if (typeof text !== 'string')
    throw new Error('Saved progress must be JSON text.');
  if (text.length > maxTextLength)
    throw new Error('Saved progress is too large.');
  let saved;
  try {
    saved = JSON.parse(text);
  } catch {
    throw new Error('Saved progress is not valid JSON.');
  }
  if (!exactObject(saved, ['schema', 'fields']) || saved.schema !== schema)
    throw new Error('This is not a saved guide session.');
  return copyFields(saved.fields);
}
