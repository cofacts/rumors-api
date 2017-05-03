process.on('unhandledRejection', (reason, p) => {
  // eslint-disable-next-line no-console
  console.log(
    'Possibly Unhandled Rejection at: Promise ',
    p,
    ' reason: ',
    reason
  );
  // application specific logging here
});
