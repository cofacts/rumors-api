function delayForMs(delayMs) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), delayMs);
  });
}

export default delayForMs;
