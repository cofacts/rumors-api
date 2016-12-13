import docLoaderFactory from './docLoaderFactory';
import rumorsByAnswerIdLoaderFactory from './rumorsByAnswerIdLoaderFactory';

export default class DataLoaders {

  // List of data loaders
  //
  get docLoader() { return this._checkOrSetLoader('answerLoader', docLoaderFactory); }
  get rumorsByAnswerIdLoader() { return this._checkOrSetLoader('rumorsByAnswerIdLoader', rumorsByAnswerIdLoaderFactory); }

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
