import getInFactory from '../getInFactory';

describe('getInFactory', () => {
  it('should get nested data', () => {
    expect(
      getInFactory({
        key: { key2: [{ key3: 'value' }] },
      })(['key', 'key2', 0, 'key3'])
    ).toBe('value');
  });

  it('should stop on non-existing key and provides default value', () => {
    expect(getInFactory({})(['not-exist-key'])).toBe(undefined);
    expect(getInFactory({})(['not-exist-key'], 42)).toBe(42);

    expect(
      getInFactory({
        key: { key2: [{ key3: 'value' }] },
      })(['key', 'key3'])
    ).toBe(undefined);

    // Edge cases for root data
    //
    expect(getInFactory(0)(['key', 'key2'])).toBe(undefined);
    expect(getInFactory(null)(['key', 'key2'])).toBe(undefined);
    expect(getInFactory(undefined)(['key', 'key2'])).toBe(undefined);
    expect(getInFactory(false)(['key', 'key2'])).toBe(undefined);
    expect(getInFactory(NaN)(['key', 'key2'])).toBe(undefined);

    // Edge cases for keys
    //
    expect(getInFactory(100)([])).toBe(100);
    expect(getInFactory(false)([])).toBe(false);
  });

  it('should not give default value when data exists', () => {
    expect(
      getInFactory({
        key: 0,
      })(['key'], 100)
    ).toBe(0);

    expect(
      getInFactory({
        key: false,
      })(['key'], 100)
    ).toBe(false);

    expect(
      getInFactory({
        key: null,
      })(['key'], 100)
    ).toBe(null);

    expect(
      getInFactory({
        key: NaN,
      })(['key'], 100)
    ).toBeNaN();
  });

  it('handles object without prototype', () => {
    const a = Object.create(null);
    a.foo = Object.create(null);
    a.foo.bar = 123;
    expect(getInFactory(a)(['foo', 'bar'])).toBe(123);
  });
});
