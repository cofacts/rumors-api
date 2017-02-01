import { readFileSync, writeFileSync } from 'fs';
import { compareTwoStrings } from 'string-similarity';
import parse from 'csv-parse/lib/sync';
import ProgressBar from 'progress';
import readline from 'readline';
import '../util/catchUnhandledRejection';

const inFile = process.argv[2];
const outFile = inFile.replace(/.csv$/, '.json');

const records = parse(readFileSync(inFile, 'utf-8'), { columns: true });

if (process.argv.length !== 3) {
  console.log('Usage: babel-node scripts/airtableCsvToJson.js <PATH_TO_CSV_FILE>');
  process.exit(1);
}

const MIN_SIMILARITY = 0.4;
const SAFE_SIMILARITY = 0.7;


function findDuplication(texts, target) {
  let idx = -1;
  let bestSimilarity = MIN_SIMILARITY;

  texts.forEach((text, i) => {
    const similarity = compareTwoStrings(text, target);
    if (similarity > bestSimilarity) {
      idx = i;
      bestSimilarity = similarity;
    }
  });

  return { idx, similarity: bestSimilarity };
}

function askSimilarity(doc1, doc2) {
  return new Promise((resolve) => {
    console.log('\n==============================');
    console.log(doc1);
    console.log('------------------------------');
    console.log(doc2);
    console.log('==============================\n');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Are these 2 documents the same? (Y/n)', (ans) => {
      if (ans === 'n') resolve(false);
      else resolve(true);
      rl.close();
    });
  });
}

async function aggregateRowsToDocs(rows) {
  const rumors = []; // rumors docs to return
  const answers = []; // answer docs to return
  const rumorTexts = []; // cached text array. Should be 1-1 mapping to rumors[].
  const answerTexts = []; // cached text array. Should be 1-1 mapping to answers[].

  const bar = new ProgressBar('Aggregating Rows :bar', { total: rows.length });

  for (const record of rows) {
    let rumor;
    const rumorText = record['Rumor Text'];
    const { idx: rumorIdx, similarity: rumorSimilarity } = findDuplication(rumorTexts, rumorText);

    if (
      rumorIdx !== -1 && (
        rumorSimilarity > SAFE_SIMILARITY ||
        console.log('\nSimilarity =', rumorSimilarity) || await askSimilarity(rumors[rumorIdx].text, rumorText)
      )
    ) {
      rumor = rumors[rumorIdx];
    } else {
      rumor = {
        id: `${record['Message ID']}-rumor`,
        text: rumorText,
        answerIds: [],
      };
      rumors.push(rumor);
      rumorTexts.push(rumorText);
    }

    if (record.Answer) {
      const answerText = record.Answer;
      const {
        idx: answerIdx,
        similarity: answerSimilarity,
      } = findDuplication(answerTexts, answerText);
      let answer;

      if (answerIdx !== -1 && (
        answerSimilarity > SAFE_SIMILARITY ||
        console.log(
          '\nSimilarity =', answerSimilarity) ||
          await askSimilarity(answers[answerIdx].versions[0].text, answerText,
        )
      )) {
        answer = answers[answerIdx];
      } else {
        answer = {
          id: `${record['Message ID']}-answer`,
          versions: [{
            text: record.Answer,
            reference: record.Reference,
          }],
        };
        answers.push(answer);
        answerTexts.push(answerText);
      }

      rumor.answerIds.push(answer.id);
    }

    bar.tick();
  }

  return { rumors, answers };
}


aggregateRowsToDocs(records).then((data) => {
  writeFileSync(outFile, JSON.stringify(data));
});
