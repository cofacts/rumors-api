import Bulk from 'util/bulk';

/** Minimal ES client stub: records bulk() calls and replays queued results. */
function fakeClient(results = []) {
  const queue = [...results];
  return {
    bulk: jest.fn(async () => queue.shift() ?? { items: [], errors: false }),
  };
}

describe('Bulk', () => {
  it('does not call ES when there is nothing queued', async () => {
    const client = fakeClient();
    const bulk = new Bulk(client);

    expect(await bulk.flush()).toBe(bulk);
    expect(client.bulk).not.toHaveBeenCalled();
  });

  it('queues operations and flushes them with refresh', async () => {
    const client = fakeClient([{ items: [1, 2], errors: false }]);
    const bulk = new Bulk(client);

    expect(await bulk.push([{ index: {} }, { doc: 1 }])).toBe(bulk);
    // Below the threshold: still buffered, nothing sent yet
    expect(client.bulk).not.toHaveBeenCalled();

    await bulk.flush();
    expect(client.bulk).toHaveBeenCalledWith({
      operations: [{ index: {} }, { doc: 1 }],
      refresh: 'true',
    });
  });

  it('empties the buffer after flushing, so a second flush is a no-op', async () => {
    const client = fakeClient();
    const bulk = new Bulk(client, 1);

    await bulk.push([{ index: {} }]);
    await bulk.flush();
    expect(client.bulk).toHaveBeenCalledTimes(1);

    await bulk.flush();
    expect(client.bulk).toHaveBeenCalledTimes(1);
  });

  it('auto-flushes once the buffer exceeds 3x the batch size', async () => {
    const client = fakeClient();
    const bulk = new Bulk(client, 2); // flushes when > 6 operations buffered

    await bulk.push(new Array(6).fill({ doc: 1 }));
    expect(client.bulk).not.toHaveBeenCalled();

    await bulk.push([{ doc: 2 }]);
    expect(client.bulk).toHaveBeenCalledTimes(1);
    expect(client.bulk.mock.calls[0][0].operations).toHaveLength(7);
  });

  it('tracks the number of logical actions pushed', async () => {
    const bulk = new Bulk(fakeClient());

    await bulk.push([{ index: {} }, { doc: 1 }], 1);
    await bulk.push([{ index: {} }, { doc: 2 }], 2);

    expect(bulk.actionsCount).toBe(3);
  });

  it('logs the processed count on success', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const client = fakeClient([{ items: [1, 2, 3], errors: false }]);

    await new Bulk(client).push([{ doc: 1 }]).then((b) => b.flush());

    expect(info).toHaveBeenCalledWith('3 items processed');
    info.mockRestore();
  });

  it('logs errors reported by ES instead of the processed count', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const client = fakeClient([{ items: [1], errors: true }]);

    await new Bulk(client).push([{ doc: 1 }]).then((b) => b.flush());

    expect(error).toHaveBeenCalledWith(true);
    expect(info).not.toHaveBeenCalled();
    error.mockRestore();
    info.mockRestore();
  });
});
