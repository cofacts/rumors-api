import docLoaderFactory from './docLoaderFactory';
import articlesByReplyIdLoaderFactory from './articlesByReplyIdLoaderFactory';
import replyRequestsByArticleIdLoaderFactory from './replyRequestsByArticleIdLoaderFactory';

export default class DataLoaders {

  // List of data loaders
  //
  get docLoader() { return this._checkOrSetLoader('docLoader', docLoaderFactory); }
  get articlesByReplyIdLoader() { return this._checkOrSetLoader('articlesByReplyIdLoader', articlesByReplyIdLoaderFactory); }
  get replyRequestsByArticleIdLoader() { return this._checkOrSetLoader('replyRequestsByArticleIdLoader', replyRequestsByArticleIdLoaderFactory); }

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
