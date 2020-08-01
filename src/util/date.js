const dateFormat = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * Given a date string, determine if it's a valid date, and return a Date object if it is.

 * @param {string} dateStr        A string representation of a date in YYYY-MM-DD
 * @param {string} [name='Date']  A string used in error message

 * @return {Date}
 */
const convertAndValidateDate = (dateStr, name = 'Date') => {
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
 * @return {object}                         Validation result/error
 */
const validateDateRange = (
  startDateStr,
  endDateStr,
  maxDuration,
  allowFutureDate = false
) => {
  let errorMessage, startDate, endDate;

  if (!startDateStr || !endDateStr) {
    errorMessage = 'must include both start date and end date';
  } else {
    try {
      startDate = convertAndValidateDate(startDateStr, 'start date');
      endDate = convertAndValidateDate(endDateStr, 'end date');
    } catch (e) {
      errorMessage = e.message;
    }
    const duration = endDate - startDate;
    if (duration < 0) {
      errorMessage = 'end date cannot be earlier than start date';
    } else if (maxDuration && duration > maxDuration) {
      // TODO: write a formator that uses the most sensible time unit to describe duration.
      errorMessage = `start date and end date cannot be more than ${maxDuration} apart`;
    } else if (!allowFutureDate && endDate - new Date() > 0) {
      errorMessage = 'end date must be no later than today';
    }
  }
  return {
    isValid: !errorMessage,
    error: errorMessage,
    startDate,
    endDate,
  };
};

export { convertAndValidateDate, validateDateRange };
