import docLoaderFactory from './docLoaderFactory';
import analyticsLoaderFactory from './analyticsLoaderFactory';
import articleRepliesByReplyIdLoaderFactory from './articleRepliesByReplyIdLoaderFactory';
import articleCategoriesByCategoryIdLoaderFactory from './articleCategoriesByCategoryIdLoaderFactory';
import articleReplyFeedbacksLoaderFactory from './articleReplyFeedbacksLoaderFactory';
import articleCategoryFeedbacksLoaderFactory from './articleCategoryFeedbacksLoaderFactory';
import searchResultLoaderFactory from './searchResultLoaderFactory';
import urlLoaderFactory from './urlLoaderFactory';
import repliedArticleCountLoaderFactory from './repliedArticleCountLoaderFactory';
import votedArticleReplyCountLoaderFactory from './votedArticleReplyCountLoaderFactory';
import userLevelLoaderFactory from './userLevelLoaderFactory';
import userLoaderFactory from './userLoaderFactory';

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
  get articleCategoriesByCategoryIdLoader() {
    return this._checkOrSetLoader(
      'articleCategoriesByCategoryIdLoader',
      articleCategoriesByCategoryIdLoaderFactory
    );
  }
  get articleReplyFeedbacksLoader() {
    return this._checkOrSetLoader(
      'articleReplyFeedbacksLoader',
      articleReplyFeedbacksLoaderFactory
    );
  }
  get articleCategoryFeedbacksLoader() {
    return this._checkOrSetLoader(
      'articleCategoryFeedbacksLoader',
      articleCategoryFeedbacksLoaderFactory
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

  get repliedArticleCountLoader() {
    return this._checkOrSetLoader(
      'repliedArticleCountLoader',
      repliedArticleCountLoaderFactory
    );
  }

  get votedArticleReplyCountLoader() {
    return this._checkOrSetLoader(
      'votedArticleReplyCountLoader',
      votedArticleReplyCountLoaderFactory
    );
  }

  get userLoader() {
    return this._checkOrSetLoader('userLoader', userLoaderFactory);
  }

  get userLevelLoader() {
    return this._checkOrSetLoader('userLevelLoader', userLevelLoaderFactory);
  }

  get analyticsLoader() {
    return this._checkOrSetLoader('analyticsLoader', analyticsLoaderFactory);
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
