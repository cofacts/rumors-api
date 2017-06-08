import docLoaderFactory from './docLoaderFactory';
import replyConnectionsByReplyIdLoaderFactory
  from './replyConnectionsByReplyIdLoaderFactory';
import searchResultLoaderFactory from './searchResultLoaderFactory';
import childrenCountLoaderFactory from './childrenCountLoaderFactory';
import childrenLoaderFactory from './childrenLoaderFactory';

export default class DataLoaders {
  // List of data loaders
  //
  get docLoader() {
    return this._checkOrSetLoader('docLoader', docLoaderFactory);
  }
  get replyConnectionsByReplyIdLoader() {
    return this._checkOrSetLoader(
      'replyConnectionsByReplyIdLoader',
      replyConnectionsByReplyIdLoaderFactory
    );
  }
  get searchResultLoader() {
    return this._checkOrSetLoader(
      'searchResultLoader',
      searchResultLoaderFactory
    );
  }
  get childrenCountLoader() {
    return this._checkOrSetLoader(
      'childrenCountLoader',
      childrenCountLoaderFactory
    );
  }

  get childrenLoader() {
    return this._checkOrSetLoader('childrenLoader', childrenLoaderFactory);
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
