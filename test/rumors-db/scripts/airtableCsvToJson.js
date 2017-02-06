/* eslint no-console: off */

import { readFileSync, writeFileSync } from 'fs';
// import { compareTwoStrings } from 'string-similarity';
import parse from 'csv-parse/lib/sync';
import ProgressBar from 'progress';
import '../util/catchUnhandledRejection';

const inFile = process.argv[2];
const outFile = inFile.replace(/.csv$/, '.json');

const records = parse(readFileSync(inFile, 'utf-8'), { columns: true });

if (process.argv.length !== 3) {
  console.log('Usage: babel-node scripts/airtableCsvToJson.js <PATH_TO_CSV_FILE>');
  process.exit(1);
}

async function aggregateRowsToDocs(rows) {
  const rumors = []; // rumors docs to return
  const answers = []; // answer docs to return
  const rumorTextToId = {};
  const answerTextToId = {};

  const bar = new ProgressBar('Aggregating Rows :bar', { total: rows.length });

  for (const record of rows) {
    let rumor;
    const rumorText = record['Rumor Text'];

    if (rumorTextToId[rumorText]) {
      rumor = rumors[rumorTextToId[rumorText]];
    } else {
      rumor = {
        id: `${record['Message ID']}-rumor`,
        text: rumorText,
        answerIds: [],
      };
      rumors.push(rumor);
    }

    if (record.Answer) {
      const answerText = record.Answer;
      let answer;

      if (answerTextToId[answerText]) {
        answer = answers[answerTextToId[answerText]];
      } else {
        answer = {
          id: `${record['Message ID']}-answer`,
          versions: [{
            text: record.Answer,
            reference: record.Reference,
          }],
        };
        answers.push(answer);
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
