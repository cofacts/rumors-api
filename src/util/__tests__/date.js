import { assertAndConvertDate, assertDateRange } from '../date';

describe('date utils', () => {
  it('assertAndConvertDate should raise errors when given invalid date', () => {
    expect(() => assertAndConvertDate('20200101', 'start date')).toThrow(
      'start date must be in the format of YYYY-MM-DD'
    );
    expect(() => assertAndConvertDate('2020-05-35', 'start date')).toThrow(
      'start date must be a valid date in the format of YYYY-MM-DD'
    );
  });

  it('assertAndConvertDate should return Date object when given valid date string', () => {
    expect(assertAndConvertDate('2020-01-01', 'start date')).toStrictEqual(
      new Date('2020-01-01')
    );
  });

  it('assertDateRange should return Date objects if both date strings are valid', () => {
    expect(assertDateRange('2020-01-01', '2020-07-01')).toStrictEqual({
      startDate: new Date('2020-01-01'),
      endDate: new Date('2020-07-01'),
    });

    expect(
      assertDateRange('2020-01-01', '3000-07-01', undefined, true)
    ).toStrictEqual({
      startDate: new Date('2020-01-01'),
      endDate: new Date('3000-07-01'),
    });
  });

  it('assertDateRange should raise error upon invalid params', () => {
    const invalidArgs = [
      ['2020-01-01'],
      ['2020-01-01', '2019-01-01'],
      ['2019-01-01', '2020-01-01', 2592000000],
      ['3000-01-01', '3000-01-01'],
    ];
    invalidArgs.forEach(args => {
      let error;
      try {
        assertDateRange(...args);
      } catch (e) {
        error = e;
      }
      expect(error).toMatchSnapshot();
    });
  });
});
