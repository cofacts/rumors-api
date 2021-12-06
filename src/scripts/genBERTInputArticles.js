import 'dotenv/config';
import fetch from 'node-fetch';

/**
 * @param {string[][]} range - Spreadsheet range data with 1st row being the column names
 * @param {object[]}
 */
export function range2Objects(range) {
  const [columnNames, ...dataRows] = range;
  return dataRows.map(row =>
    row.reduce((obj, cell, colIdx) => {
      obj[columnNames[colIdx]] = cell;
      return obj;
    }, {})
  );
}

/**
 *
 * @param {string} googleSheetId
 * @param {{ mappings: object[], articleCategories: object[] }}
 */
async function readFromGoogleSheet(googleSheetId) {
  const {
    valueRanges: [
      { values: articleCategoriesRange },
      { values: mappingsRange },
    ],
  } = await (await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}/values:batchGet?key=${
      process.env.GOOGLE_SHEETS_API_KEY
    }&ranges=Article categories!A1:L&ranges=Mappings!A1:C`
  )).json();

  return {
    mappings: range2Objects(mappingsRange),
    articleCategories: range2Objects(articleCategoriesRange),
  };
}

async function main() {
  console.log(
    await readFromGoogleSheet('1Y9FrI01in2hz5eiveGknH0HE081sr7gVuk0a7hqqKuc')
  );
}

/* istanbul ignore if */
if (require.main === module) {
  main().catch(console.error);
}
