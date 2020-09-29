const BATCH_SIZE = 100;

export default class Bulk {
  constructor(batch_size = BATCH_SIZE) {
    this.batch_size = batch_size;
    this._operations = [];
  }

  push(...args) {
    this._operations.push(...args);
    if (this._operations.length >= this.batch_size) {
      this.flush();
    }

    return this;
  }

  async flush() {
    // Process first BATCH_SIZE entires queued up
    const op = this._operations.splice(0, BATCH_SIZE);

    const { body } = await client.bulk({
      body: op,
    });
    if (body.errors) {
      console.error(body.errors);
    } else {
      console.info(
        'Bulk operations complete:',

        // Count each results
        body.items.reduce((results, { result }) => {
          if (results[result] === undefined) results[result] = 0;
          results[result] += 1;
        }, {})
      );
    }

    return this;
  }
}
