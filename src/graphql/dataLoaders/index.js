import docLoaderFactory from './docLoaderFactory';
import articleRepliesByReplyIdLoaderFactory from './articleRepliesByReplyIdLoaderFactory';
import articleReplyFeedbacksLoaderFactory from './articleReplyFeedbacksLoaderFactory';
import searchResultLoaderFactory from './searchResultLoaderFactory';
import repliedArticleCountLoaderFactory from './repliedArticleCountLoaderFactory';
import userLevelLoaderFactory from './userLevelLoaderFactory';

export default class DataLoaders {
  // List of data loaders
  //
  get docLoader() {
    return this._checkOrSetLoader('docLoader', docLoaderFactory);
  }
  get articleRepliesByReplyIdLoader() {
    return this._checkOrSetLoader(
      'articleRepliesByReplyIdLoader',
      articleRepliesByReplyIdLoaderFactory
    );
  }
  get articleReplyFeedbacksLoader() {
    return this._checkOrSetLoader(
      'articleReplyFeedbacksLoader',
      articleReplyFeedbacksLoaderFactory
    );
  }
  get searchResultLoader() {
    return this._checkOrSetLoader(
      'searchResultLoader',
      searchResultLoaderFactory
    );
  }

  get repliedArticleCountLoader() {
    return this._checkOrSetLoader(
      'repliedArticleCountLoader',
      repliedArticleCountLoaderFactory
    );
  }

  get userLevelLoader() {
    return this._checkOrSetLoader('userLevelLoader', userLevelLoaderFactory);
  }

  // inner-workings
  //
  constructor() {
    this._loaders = {};
  }

  _checkOrSetLoader(name, factoryFn) {
    if (this._loaders[name]) return this._loaders[name];

    this._loaders[name] = factoryFn();
    return this._loaders[name];
  }
}
