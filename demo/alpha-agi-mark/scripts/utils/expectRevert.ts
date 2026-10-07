export async function expectRevert(
  label: string,
  expectedData: string,
  action: () => Promise<unknown>
): Promise<void> {
  if (!/^0x(?:[a-fA-F0-9]{2}){4,}$/.test(expectedData))
    throw new Error('Expected revert bytes are required');
  try {
    await action();
  } catch (error) {
    const data =
      error && typeof error === 'object' && 'data' in error
        ? error.data
        : undefined;
    if (
      typeof data === 'string' &&
      data.toLowerCase() === expectedData.toLowerCase()
    ) {
      console.log(`   ✅ ${label} rejected with the expected contract revert`);
      return;
    }
    throw Object.assign(new Error(`${label} failed for an unexpected reason`), {
      cause: error,
    });
  }
  throw new Error(`${label} unexpectedly succeeded; guard verification failed`);
}
