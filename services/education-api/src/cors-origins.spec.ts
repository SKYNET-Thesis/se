import { corsOrigins } from './cors-origins';

describe('corsOrigins', () => {
  it('allows both loopback Vite origins outside production', () => {
    expect(corsOrigins('development', 'http://localhost:5173')).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('does not add loopback origins in production', () => {
    expect(corsOrigins('production', 'https://app.example.test')).toEqual(['https://app.example.test']);
  });

  it('does not add loopback origins in other non-development environments', () => {
    expect(corsOrigins('test', 'https://preview.example.test')).toEqual(['https://preview.example.test']);
  });
});
