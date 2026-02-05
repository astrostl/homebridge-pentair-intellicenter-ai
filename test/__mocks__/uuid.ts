// Mock for uuid module to avoid ESM compatibility issues with Jest
let counter = 0;

export const v4 = jest.fn(() => {
  counter++;
  // Return a properly formatted UUID for tests that validate the format
  const hex = counter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
});

// Reset counter between tests if needed
export const __resetCounter = () => {
  counter = 0;
};
