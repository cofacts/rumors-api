import docLoaderFactory from './docLoaderFactory';
import articlesByReplyIdLoaderFactory from './articlesByReplyIdLoaderFactory';
import searchResultLoaderFactory from './searchResultLoaderFactory';

export default class DataLoaders {

  // List of data loaders
  //
  get docLoader() { return this._checkOrSetLoader('docLoader', docLoaderFactory); }
  get articlesByReplyIdLoader() { return this._checkOrSetLoader('articlesByReplyIdLoader', articlesByReplyIdLoaderFactory); }
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
