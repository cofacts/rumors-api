const BATCH_SIZE = 100;

export default class Bulk {
  constructor(client, batch_size = BATCH_SIZE) {
    this.client = client;
    this.batch_size = batch_size;
    this._operations = [];
    this.actionsCount = 0;
  }

  async push(items, count = 1) {
    this._operations.push(...items);
    this.actionsCount += count;
    if (
      this.actionCounts > this.batch_size ||
      this._operations.length > 3 * this.batch_size
    ) {
      await this.flush();
    }
    return this;
  }

  async flush() {
    if (this._operations.length === 0) {
      return this;
    }

    // Process entires queued up
    const op = this._operations.splice(0);
    this.actionCounts = 0;
    const { body } = await this.client.bulk({
      body: op,
      refresh: 'true',
    });
    if (body.errors) {
      console.error(body.errors);
    } else {
      console.info(body.items.length);
      // console.log(JSON.stringify(body, null, 2));

      /* console.info(
        'Bulk operations complete:',

        // Count each results
        body.items.reduce((results, { result }) => {
          if (results[result] === undefined) results[result] = 0;
          results[result] += 1;
        }, {})
      );*/
    }

    return this;
  }
}
