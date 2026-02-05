// Mock for uuid module - required because uuid v13+ is ESM-only and Jest requires CJS.
// Generates unique (non-deterministic) UUIDs to avoid masking bugs where message ID uniqueness matters.
export const v4 = jest.fn(() => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
});
