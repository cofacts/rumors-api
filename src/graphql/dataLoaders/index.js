import docLoaderFactory from './docLoaderFactory';
import articlesByReplyIdLoaderFactory from './articlesByReplyIdLoaderFactory';

export default class DataLoaders {

  // List of data loaders
  //
  get docLoader() { return this._checkOrSetLoader('docLoader', docLoaderFactory); }
  get articlesByReplyIdLoader() { return this._checkOrSetLoader('articlesByReplyIdLoader', articlesByReplyIdLoaderFactory); }

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
