export default data => (path, defaultValue) => {
  const result = (path || []).reduce((res, d) => {
    if (res !== null && typeof res === 'object') {
      return res[d];
    }
    return undefined;
  }, data);
  return result === undefined ? defaultValue : result;
};
