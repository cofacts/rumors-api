import { convertAndValidateDate, validateDateRange } from '../date';

describe('date utils', () => {
  it('convertAndValidateDate should raise errors when given invalid date', () => {
    expect(() => convertAndValidateDate('20200101', 'start date')).toThrow(
      'start date must be in the format of YYYY-MM-DD'
    );
    expect(() => convertAndValidateDate('2020-05-35', 'start date')).toThrow(
      'start date must be a valid date in the format of YYYY-MM-DD'
    );
  });

  it('convertAndValidateDate should return Date object when given valid date string', () => {
    expect(convertAndValidateDate('2020-01-01', 'start date')).toStrictEqual(
      new Date('2020-01-01')
    );
  });

  it('validateDateRange should return Date objects if both date strings are valid', () => {
    expect(validateDateRange('2020-01-01', '2020-07-01')).toStrictEqual({
      isValid: true,
      error: undefined,
      startDate: new Date('2020-01-01'),
      endDate: new Date('2020-07-01'),
    });
  });

  it('validateDateRange should raise error upon invalid params', () => {
    const invalidArgs = [
      ['2020-01-01'],
      ['2020-01-01', '2019-01-01'],
      ['2019-01-01', '2020-01-01', 2592000000],
      ['3000-01-01', '3000-01-01'],
    ];
    invalidArgs.forEach(args => {
      const { isValid, error } = validateDateRange(...args);
      expect(isValid).toBe(false);
      expect(error).toMatchSnapshot();
    });
  });
});
