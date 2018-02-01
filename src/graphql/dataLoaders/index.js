import docLoaderFactory from './docLoaderFactory';
import articleRepliesByReplyIdLoaderFactory from './articleRepliesByReplyIdLoaderFactory';
import searchResultLoaderFactory from './searchResultLoaderFactory';

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
  get searchResultLoader() {
    return this._checkOrSetLoader(
      'searchResultLoader',
      searchResultLoaderFactory
    );
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
