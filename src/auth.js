import passport from 'koa-passport';
import config from 'config';
import client, { processMeta } from 'util/client';
import FacebookStrategy from 'passport-facebook';
import TwitterStrategy from 'passport-twitter';
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

    if (profile.emails && profile.emails[0].value) {
      // search with email
      //
      const usersWithEmail = await client.search({
        index: 'users', type: 'basic', q: `email:${profile.emails[0].value}`,
      });

      if (usersWithEmail.hits.total) {
        const id = usersWithEmail.hits.hits[0]._id;
        // Connect user with facebookId for faster login next time.
        //
        const updateUserResult = await client.update({
          index: 'users',
          type: 'basic',
          id,
          body: {
            doc: {
              facebookId: profile.id,
              updatedAt: now,
            },
          },
          _source: true,
        });

        return done(null, processMeta({ ...updateUserResult.get, _id: id }));
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
        facebookId: profile.id,
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

passport.use(new TwitterStrategy({
  consumerKey: config.get('TWITTER_CONSUMER_KEY'),
  consumerSecret: config.get('TWITTER_CONSUMER_SECRET'),
  callbackURL: config.get('TWITTER_CALLBACK_URL'),

  // https://github.com/jaredhanson/passport-twitter/issues/67#issuecomment-275288663
  userProfileURL: 'https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true',
}, async (token, tokenSecret, profile, done) => {
  const now = (new Date()).toISOString();

  try {
    const users = await client.search({
      index: 'users', type: 'basic', q: `twitterId:${profile.id}`,
    });


    if (users.hits.total) {
      // Has user with such user id
      return done(null, processMeta(users.hits.hits[0]));
    }

    if (profile.emails && profile.emails[0].value) {
      // search with email
      //
      const usersWithEmail = await client.search({
        index: 'users', type: 'basic', q: `email:${profile.emails[0].value}`,
      });

      if (usersWithEmail.hits.total) {
        // Connect user with facebookId for faster login next time.
        //
        const id = usersWithEmail.hits.hits[0]._id;
        const updateUserResult = await client.update({
          index: 'users',
          type: 'basic',
          id,
          body: {
            doc: {
              twitterId: profile.id,
              updatedAt: now,
            },
          },
          _source: true,
        });

        return done(null, processMeta({ ...updateUserResult.get, _id: id }));
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
        twitterId: profile.id,
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
  .get('/facebook', passport.authenticate('facebook', { scope: ['email'] }))
  .get('/twitter', passport.authenticate('twitter'));

const handlePassportCallback = strategy => (ctx, next) => passport.authenticate(
  strategy,
  (err, user) => {
    if (!err && !user) err = new Error('No such user');

    if (err) {
      err.status = 401; throw err;
    }

    ctx.login(user);
  },
)(ctx, next);


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
  .get('/facebook', handlePassportCallback('facebook'))
  .get('/twitter', handlePassportCallback('twitter'));
