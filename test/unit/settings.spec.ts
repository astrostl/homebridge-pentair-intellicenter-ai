import { PLATFORM_NAME, PLUGIN_NAME, MANUFACTURER } from '../../src/settings';

describe('Settings Module', () => {
  it('should export correct PLATFORM_NAME', () => {
    expect(PLATFORM_NAME).toBe('PentairIntelliCenter');
    expect(typeof PLATFORM_NAME).toBe('string');
  });

  it('should export correct PLUGIN_NAME', () => {
    expect(PLUGIN_NAME).toBe('homebridge-pentair-intellicenter-ai');
    expect(typeof PLUGIN_NAME).toBe('string');
  });

  it('should export correct MANUFACTURER', () => {
    expect(MANUFACTURER).toBe('Pentair');
    expect(typeof MANUFACTURER).toBe('string');
  });

  it('should have non-empty string values for all exports', () => {
    expect(PLATFORM_NAME.length).toBeGreaterThan(0);
    expect(PLUGIN_NAME.length).toBeGreaterThan(0);
    expect(MANUFACTURER.length).toBeGreaterThan(0);
  });

  it('should have consistent naming between platform and plugin', () => {
    // Both should contain references to Pentair/IntelliCenter
    expect(PLATFORM_NAME.toLowerCase()).toContain('pentair');
    expect(PLATFORM_NAME.toLowerCase()).toContain('intellicenter');
    expect(PLUGIN_NAME.toLowerCase()).toContain('intellicenter');
  });
});
