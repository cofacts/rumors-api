const BATCH_SIZE = 100;

export default class Bulk {
  constructor(client, batchSize = BATCH_SIZE) {
    this.client = client;
    this.batchSize = batchSize;
    this._operations = [];
    this.actionsCount = 0;
  }

  async push(items, count = 1) {
    this._operations.push(...items);
    this.actionsCount += count;
    if (
      this.actionCounts > this.batchSize ||
      this._operations.length > 3 * this.batchSize
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
      console.info(`${body.items.length} items processed`);
    }

    return this;
  }
}
