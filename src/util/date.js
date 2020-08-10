const dateFormat = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * Given a date string, returns a Date object if it is a valid date, raises error otherwise.

 * @param {string} dateStr        A string representation of a date in YYYY-MM-DD
 * @param {string} [name='Date']  A string used in error message

 * @throws {Error}                Error thrown if date string is invalid.
 * @return {Date}
 */
const assertAndConvertDate = (dateStr, name = 'Date') => {
  if (!dateStr.match(dateFormat)) {
    throw new Error(`${name} must be in the format of YYYY-MM-DD`);
  }
  try {
    const date = new Date(dateStr);
    if (date.toString() !== 'Invalid Date') {
      return date;
    } else {
      throw new Error();
    }
  } catch {
    throw new Error(`${name} must be a valid date in the format of YYYY-MM-DD`);
  }
};

/**
 * Given two date strings and optional maxDuration, determine if it's a valid
   date range.

 * @param {string} startDateStr             A string representation of start date in YYYY-MM-DD.
 * @param {string} endDateStr               A string representation of end date in YYYY-MM-DD.
 * @param {number} [maxDuration]            Optional maximun duration in milliseconds.
   @param {bool}   [allowFutureDate=false]  Whether the date range allows end dates in the future.

 * @throws {Error}                          Error thrown if date range is invalid.
 * @return {object}                         Corresponding Date objects for start and end date.
 */
const assertDateRange = (
  startDateStr,
  endDateStr,
  maxDuration,
  allowFutureDate = false
) => {
  if (!startDateStr || !endDateStr) {
    throw new Error('must include both start date and end date');
  }
  const startDate = assertAndConvertDate(startDateStr, 'start date');
  const endDate = assertAndConvertDate(endDateStr, 'end date');
  const duration = endDate - startDate;
  if (duration < 0) {
    throw new Error('end date cannot be earlier than start date');
  }
  if (maxDuration && duration > maxDuration) {
    // TODO: write a formator that uses the most sensible time unit to describe duration.
    throw new Error(
      `start date and end date cannot be more than ${maxDuration} apart`
    );
  }
  if (!allowFutureDate && endDate - new Date() > 0) {
    throw new Error('end date must be no later than today');
  }
  return { startDate, endDate };
};

export { assertAndConvertDate, assertDateRange };
