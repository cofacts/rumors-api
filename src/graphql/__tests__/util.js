import { getRangeFieldParamFromArithmeticExpression } from '../util';

describe('getRangeFieldParamFromArithmeticExpression', () => {
  it('processes complex range queries', () => {
    expect(
      getRangeFieldParamFromArithmeticExpression({
        GT: 3,
        LT: 4,
        LTE: 5,
        GTE: 6,
      })
    ).toMatchInlineSnapshot(`
      Object {
        "gt": 3,
        "gte": 6,
        "lt": 4,
        "lte": 5,
      }
    `);
  });
  it('processes dates', () => {
    expect(
      getRangeFieldParamFromArithmeticExpression({
        GTE: 'now-1d/d',
        LT: 'now/d',
      })
    ).toMatchInlineSnapshot(`
      Object {
        "gte": "now-1d/d",
        "lt": "now/d",
      }
    `);
  });
  it('EQ overrides all', () => {
    expect(
      getRangeFieldParamFromArithmeticExpression({
        EQ: 0, // This should override others
        GT: 3,
        LTE: 4,
      })
    ).toMatchInlineSnapshot(`
      Object {
        "gte": 0,
        "lte": 0,
      }
    `);
  });
});
