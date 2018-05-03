import { getPointsRequired, getLevel } from '../level';

describe('getPointsRequired', () => {
  it('returns correct point for ordinary level', () => {
    expect(getPointsRequired(0)).toEqual(0);
    expect(getPointsRequired(1)).toEqual(1);
    expect(getPointsRequired(2)).toEqual(2);
    expect(getPointsRequired(5)).toEqual(8);
  });
  it('returns Infinity for level out of bound', () => {
    expect(getPointsRequired(100000)).toEqual(Infinity);
  });
});

describe('getLevel', () => {
  it('returns correct level for points in ladder', () => {
    expect(getLevel(0)).toEqual(0);
    expect(getLevel(1)).toEqual(1);
    expect(getLevel(2)).toEqual(2);
    expect(getLevel(3)).toEqual(3);
    expect(getLevel(4)).toEqual(3);
    expect(getLevel(5)).toEqual(4);
    expect(getLevel(7)).toEqual(4);
    expect(getLevel(8)).toEqual(5);
    expect(getLevel(121392)).toEqual(24);
    expect(getLevel(121393)).toEqual(25);
  });

  it('returns the max level for out-of-scope points', () => {
    expect(getLevel(1e9)).toEqual(25);
  });
});
