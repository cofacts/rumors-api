import docLoaderFactory from './docLoaderFactory';
import articleRepliesByReplyIdLoaderFactory from './articleRepliesByReplyIdLoaderFactory';
import articleReplyFeedbacksLoaderFactory from './articleReplyFeedbacksLoaderFactory';
import searchResultLoaderFactory from './searchResultLoaderFactory';
import urlLoaderFactory from './urlLoaderFactory';

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

  get urlLoader() {
    return this._checkOrSetLoader('urlLoader', urlLoaderFactory);
  }

  // inner-workings
  //
  constructor() {
    this._loaders = {};
  }

  _checkOrSetLoader(name, factoryFn) {
    if (this._loaders[name]) return this._loaders[name];

    this._loaders[name] = factoryFn(this);
    return this._loaders[name];
  }
}
