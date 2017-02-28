import docLoaderFactory from './docLoaderFactory';
import articleByReplyConnectionIdLoaderFactory from './articleByReplyConnectionIdLoaderFactory';
import replyConnectionsByReplyIdLoaderFactory from './replyConnectionsByReplyIdLoaderFactory';
import searchResultLoaderFactory from './searchResultLoaderFactory';

export default class DataLoaders {

  // List of data loaders
  //
  get docLoader() { return this._checkOrSetLoader('docLoader', docLoaderFactory); }
  get articleByReplyConnectionIdLoader() { return this._checkOrSetLoader('articleByReplyConnectionIdLoader', articleByReplyConnectionIdLoaderFactory); }
  get replyConnectionsByReplyIdLoader() { return this._checkOrSetLoader('replyConnectionsByReplyIdLoader', replyConnectionsByReplyIdLoaderFactory); }
  get searchResultLoader() { return this._checkOrSetLoader('searchResultLoader', searchResultLoaderFactory); }

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
