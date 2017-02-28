import passport from 'koa-passport';
import config from 'config';
import client, { processMeta } from 'util/client';
import FacebookStrategy from 'passport-facebook';
import Router from 'koa-router';
import url from 'url';

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (userId, done) => {
  try {
    const user = await client.get({
      index: 'users', type: 'basic', id: userId,
    });
    done(null, processMeta(user));
  } catch (err) {
    done(err);
  }
});

passport.use(new FacebookStrategy({
  clientID: config.get('FACEBOOK_APP_ID'),
  clientSecret: config.get('FACEBOOK_SECRET'),
  callbackURL: config.get('FACEBOOK_CALLBACK_URL'),
  profileFields: ['id', 'displayName', 'photos', 'email'],
}, async (token, tokenSecret, profile, done) => {
  const now = (new Date()).toISOString();

  try {
    const users = await client.search({
      index: 'users', type: 'basic', q: `facebookId:${profile.id}`,
    });


    if (users.hits.total) {
      // Has user with such user id
      return done(null, processMeta(users.hits.hits[0]));
    }

    if (profile.emails[0].value) {
      // search with email
      //
      const usersWithEmail = await client.search({
        index: 'users', type: 'basic', q: `email:${profile.emails[0].value}`,
      });

      if (usersWithEmail.hits.total) {
        // Connect user with facebookId for faster login next time.
        // No need to await.
        //
        client.update({
          index: 'users',
          type: 'basic',
          id: usersWithEmail.hits.hits[0]._id,
          body: {
            facebookId: profile.id,
            updatedAt: now,
          },
        });

        return done(null, {
          ...processMeta(usersWithEmail.hits.hits[0]),
          facebookId: profile.id,
        });
      }
    }

    // No user in DB, create one
    const createUserResult = await client.index({
      index: 'users',
      type: 'basic',
      body: {
        email: profile.emails[0].value,
        name: profile.displayName,
        avatarUrl: profile.photos[0].value,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (createUserResult.created) {
      return done(null, processMeta(await client.get({ index: 'users', type: 'basic', id: createUserResult._id })));
    }
    return done(createUserResult.result);
  } catch (e) {
    return done(e);
  }
}));


export const loginRouter = Router()
  .use((ctx, next) => {
    // Memorize redirect in session
    //
    if (!ctx.query.redirect || !ctx.query.redirect.startsWith('/')) {
      const err = new Error('`redirect` must present in query string and start with `/`');
      err.status = 400; err.expose = true;
      throw err;
    }
    ctx.session.appId = ctx.query.appId || 'RUMORS_SITE';
    ctx.session.redirect = ctx.query.redirect;
    return next();
  })
  .get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));

export const authRouter = Router()

  .use(async (ctx, next) => {
    // Perform redirect after login
    //
    if (!ctx.session.redirect || !ctx.session.appId) {
      const err = new Error('`appId` and `redirect` must be set before. Did you forget to go to /login/*?');
      err.status = 400; err.expose = true;
      throw err;
    }

    await next();

    let basePath = '';
    if (ctx.session.appId === 'RUMORS_SITE') {
      basePath = config.get('RUMORS_SITE_CORS_ORIGIN');
    }

    // TODO: Get basePath from DB for other client apps

    ctx.redirect(url.resolve(basePath, ctx.session.redirect));
    ctx.session.appId = undefined;
    ctx.session.redirect = undefined;
  })
  .get('/facebook', (ctx, next) =>
    passport.authenticate('facebook', (err, user) => ctx.login(user))(ctx, next),
  );
