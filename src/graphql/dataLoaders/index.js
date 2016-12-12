import answerLoaderFactory from './answerLoaderFactory';
import rumorsByAnswerIdLoaderFactory from './rumorsByAnswerIdLoaderFactory';

export default class DataLoaders {
  get answerLoader() { return this._checkOrSetLoader('answerLoader', answerLoaderFactory); }
  get rumorsByAnswerIdLoader() { return this._checkOrSetLoader('rumorsByAnswerIdLoader', rumorsByAnswerIdLoaderFactory); }

  constructor() {
    this._loaders = {};
  }

  _checkOrSetLoader(name, factoryFn) {
    if(this._loaders[name]) return this._loaders[name];

    return this._loaders[name] = factoryFn();
  }
}
