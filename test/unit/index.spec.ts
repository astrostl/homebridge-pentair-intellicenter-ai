import { API } from 'homebridge';

// Mock the platform module
const mockPlatform = jest.fn();
jest.mock('../../src/platform', () => ({
  PentairPlatform: mockPlatform,
}));

// Mock settings
jest.mock('../../src/settings', () => ({
  PLATFORM_NAME: 'PentairIntelliCenter',
}));

describe('Index Module', () => {
  let mockAPI: jest.Mocked<API>;
  let indexModule: (api: API) => void;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAPI = {
      registerPlatform: jest.fn(),
    } as any;

    // Import the module fresh for each test
    delete require.cache[require.resolve('../../src/index')];
    indexModule = require('../../src/index');
  });

  it('should register the platform with Homebridge API', () => {
    indexModule(mockAPI);

    expect(mockAPI.registerPlatform).toHaveBeenCalledTimes(1);
    expect(mockAPI.registerPlatform).toHaveBeenCalledWith('PentairIntelliCenter', mockPlatform);
  });

  it('should use the correct platform name from settings', () => {
    indexModule(mockAPI);

    const registerCall = mockAPI.registerPlatform.mock.calls[0];
    expect(registerCall?.[0]).toBe('PentairIntelliCenter');
  });

  it('should pass the PentairPlatform class to registerPlatform', () => {
    indexModule(mockAPI);

    const registerCall = mockAPI.registerPlatform.mock.calls[0];
    expect(registerCall?.[1]).toBe(mockPlatform);
  });
});
