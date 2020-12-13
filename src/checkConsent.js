export default () => (ctx, next) => {
  if (ctx.get('x-accept-license') === process.env.LICENSE_URL) {
    return next();
  }

  ctx.status = 412;
  ctx.body = 'Please accept terms of use. See API server index for details.';
};
