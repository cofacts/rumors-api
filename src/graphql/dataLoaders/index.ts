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
import contributionsLoaderFactory from './contributionsLoaderFactory';

const LOADER_FACTORY_MAP = {
  docLoader: docLoaderFactory,
  articleRepliesByReplyIdLoader: articleRepliesByReplyIdLoaderFactory,
  articleCategoriesByCategoryIdLoader:
    articleCategoriesByCategoryIdLoaderFactory,
  articleReplyFeedbacksLoader: articleReplyFeedbacksLoaderFactory,
  articleCategoryFeedbacksLoader: articleCategoryFeedbacksLoaderFactory,
  searchResultLoader: searchResultLoaderFactory,
  urlLoader: urlLoaderFactory,
  repliedArticleCountLoader: repliedArticleCountLoaderFactory,
  votedArticleReplyCountLoader: votedArticleReplyCountLoaderFactory,
  userLoader: userLoaderFactory,
  userLevelLoader: userLevelLoaderFactory,
  analyticsLoader: analyticsLoaderFactory,
  contributionsLoader: contributionsLoaderFactory,
} as const;

type LoaderFactoryMap = typeof LOADER_FACTORY_MAP;

export default class DataLoaders {
  // List of data loaders
  //
  get docLoader() {
    return this._checkOrSetLoader('docLoader');
  }
  get articleRepliesByReplyIdLoader() {
    return this._checkOrSetLoader('articleRepliesByReplyIdLoader');
  }
  get articleCategoriesByCategoryIdLoader() {
    return this._checkOrSetLoader('articleCategoriesByCategoryIdLoader');
  }
  get articleReplyFeedbacksLoader() {
    return this._checkOrSetLoader('articleReplyFeedbacksLoader');
  }
  get articleCategoryFeedbacksLoader() {
    return this._checkOrSetLoader('articleCategoryFeedbacksLoader');
  }
  get searchResultLoader() {
    return this._checkOrSetLoader('searchResultLoader');
  }
  get urlLoader() {
    return this._checkOrSetLoader('urlLoader');
  }
  get repliedArticleCountLoader() {
    return this._checkOrSetLoader('repliedArticleCountLoader');
  }
  get votedArticleReplyCountLoader() {
    return this._checkOrSetLoader('votedArticleReplyCountLoader');
  }
  get userLoader() {
    return this._checkOrSetLoader('userLoader');
  }
  get userLevelLoader() {
    return this._checkOrSetLoader('userLevelLoader');
  }
  get analyticsLoader() {
    return this._checkOrSetLoader('analyticsLoader');
  }
  get contributionsLoader() {
    return this._checkOrSetLoader('contributionsLoader');
  }

  _loaders: {
    -readonly [key in keyof LoaderFactoryMap]?: ReturnType<
      LoaderFactoryMap[key]
    >;
  };

  // inner-workings
  //
  constructor() {
    this._loaders = {};
  }

  _checkOrSetLoader<N extends keyof LoaderFactoryMap>(
    name: N
  ): ReturnType<LoaderFactoryMap[N]> {
    const cached = this._loaders[name];
    if (cached) return cached;

    this._loaders[name] = LOADER_FACTORY_MAP[name](this);
    return this._loaders[name] as ReturnType<LoaderFactoryMap[N]>;
  }
}
