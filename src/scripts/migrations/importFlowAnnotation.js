/**
 * Import annotations by Flow AI Data Annotators.
 * Ground truth: https://github.com/cofacts/ground-truth/blob/main/20200324_14908.zip
 *
 * Usage:
 * 1. Connect to production DB via SSH tunnel
 * 2. Specify INPUT_DIRECTORY in code
 * 3. Run: node_modules/.bin/babel-node src/scripts/migrations/importFlowAnnotation.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createOrUpdateUser } from 'util/user';
import { createArticleCategory } from 'graphql/mutations/CreateArticleCategory';
import { createOrUpdateArticleCategoryFeedback } from 'graphql/mutations/CreateOrUpdateArticleCategoryFeedback';

const INPUT_DIRECTORY = '../ground-truth/20211204_14859';
const RUMORS_AI_APPID = 'RUMORS_AI';
const FLOW_USER_ID = 'flow-annotator';
const REVIEWER_USER_ID = 'category-reviewer';

const FLOW_ID_TO_CAT_ID = [
  // 0	= 中國影響力
  'kj287XEBrIRcahlYvQoS',
  // 1	= 性少數與愛滋病
  'kz3c7XEBrIRcahlYxAp6',
  // 2	= 女權與性別刻板印象
  'lD3h7XEBrIRcahlYeQqS',
  // 3	= 保健秘訣、食品安全
  'lT3h7XEBrIRcahlYugqq',
  // 4	= 基本人權問題
  'lj2m7nEBrIRcahlY6Ao_',
  // 5	= 農林漁牧政策
  'lz2n7nEBrIRcahlYDgri',
  // 6	= 能源轉型
  'mD2n7nEBrIRcahlYLAr7',
  // 7	= 環境生態保護
  'mT2n7nEBrIRcahlYTArI',
  // 8	= 優惠措施、新法規、政策宣導
  'mj2n7nEBrIRcahlYdArf',
  // 9	= 科技、資安、隱私
  'mz2n7nEBrIRcahlYnQpz',
  // 10 =	免費訊息詐騙
  'nD2n7nEBrIRcahlYwQoW',
  // 11 =	有意義但不包含在以上標籤
  'nT2n7nEBrIRcahlY6QqF',
  // 12 =	無意義
  'nj2n7nEBrIRcahlY-gpc',
  // 13 =	廣告
  'nz2o7nEBrIRcahlYBgqQ',
  // 14 =	只有網址其他資訊不足
  'oD2o7nEBrIRcahlYFgpm',
  // 15 =	政治、政黨
  'oT2o7nEBrIRcahlYKQoM',
  // 16 =	轉發協尋、捐款捐贈
  'oj2o7nEBrIRcahlYRAox',
];

/**
 *
 * @returns {{annotator: Object, reviewer: Object}}
 */
export async function prepareUsers() {
  const { user: annotator } = await createOrUpdateUser({
    userId: FLOW_USER_ID,
    appId: RUMORS_AI_APPID,
  });
  const { user: reviewer } = await createOrUpdateUser({
    userId: REVIEWER_USER_ID,
    appId: RUMORS_AI_APPID,
  });

  return {
    annotator,
    reviewer,
  };
}

/**
 * Process one article entry by adding article-category and add positive feedback to it
 *
 * @param {object} entry One article entry (parsed json file content) in ground truth
 * @param {object} annotator User instance for flow annotators
 * @param {object} reviewer User instance of an reviewer
 * @return {{tagCount: number; createdArticleCategoryCount: number; createdArticleCategoryFeedbackCount: number}}
 */
export async function processEntry({ id, tags }, annotator, reviewer) {
  let createdArticleCategoryCount = 0;
  let createdArticleCategoryFeedbackCount = 0;

  for (const flowId of tags) {
    const categoryId = FLOW_ID_TO_CAT_ID[flowId];

    try {
      await createArticleCategory({
        articleId: id,
        categoryId,
        user: annotator,
      });

      createdArticleCategoryCount += 1;
    } catch (e) {
      /* istanbul ignore if */
      if (!e?.message?.startsWith('Cannot add articleCategory')) {
        // Rethrow unexpected error
        throw e;
      }
      // Someone else already added this category; do nothing
    }

    try {
      await createOrUpdateArticleCategoryFeedback({
        articleId: id,
        categoryId,
        vote: 1,
        comment: '若水標記之分類',
        user: reviewer,
      });
      createdArticleCategoryFeedbackCount += 1;
    } catch (e) {
      /* istanbul ignore if */
      if (!e?.message?.startsWith('Cannot article')) {
        // Rethrow unexpected error
        throw e;
      }
      // Reviewer already upvnoted this article category (maybe during code rerun after error?).
      // Can just ignore.
    }
  }

  return {
    tagCount: tags.length,
    createdArticleCategoryCount,
    createdArticleCategoryFeedbackCount,
  };
}

/**
 * Go through all files and process one by one
 */
/* istanbul ignore next */
async function main() {
  const dir = await fs.promises.opendir(INPUT_DIRECTORY);
  let idx = 0;
  let createdArticleCategorySum = 0;
  let createdArticleCategoryFeedbackSum = 0;
  const { annotator, reviewer } = await prepareUsers();

  for await (const dirent of dir) {
    if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
    idx += 1;

    const entry = require(path.resolve(INPUT_DIRECTORY, dirent.name));
    const { createdArticleCategoryCount, createdArticleCategoryFeedbackCount } =
      await processEntry(entry, annotator, reviewer);

    createdArticleCategorySum += createdArticleCategoryCount;
    createdArticleCategoryFeedbackSum += createdArticleCategoryFeedbackCount;

    console.log(
      `[${idx.toString().padStart(5)}] ${
        entry.id
      }\t: + ${createdArticleCategoryCount} categories & ${createdArticleCategoryFeedbackCount} feedbacks`
    );
  }

  console.log('------');
  console.log('Created article-categories: ', createdArticleCategorySum);
  console.log('Created feedbacks: ', createdArticleCategoryFeedbackSum);
}

/* istanbul ignore if */
if (require.main === module) {
  main().catch(console.error);
}
