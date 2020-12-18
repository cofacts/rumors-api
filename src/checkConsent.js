const LICENSES = (process.env.LICENSE_URL || '').split(',');

export default () => (ctx, next) => {
  if (LICENSES.includes(ctx.get('x-accept-license'))) {
    return next();
  }

  ctx.status = 412;
  ctx.body = 'Please accept terms of use. See API server index for details.';
};
