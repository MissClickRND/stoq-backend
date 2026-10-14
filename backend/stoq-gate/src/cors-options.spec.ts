import { corsOptions } from './cors-options';

describe('gateway CORS options', () => {
  it('allows the desktop application origin and both local development ports', () => {
    expect(corsOptions.origin).toEqual(
      expect.arrayContaining([
        'stoq://app',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
      ]),
    );
    expect(corsOptions.credentials).toBe(true);
  });
});
