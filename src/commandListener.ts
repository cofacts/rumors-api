async function main() {
  if (!process.env.ADMIN_PUBSUB_TOPIC) {
    console.info(
      '[command-listener] `ADMIN_PUBSUB_TOPIC` is not set, exiting...'
    );
    process.exit(0);
  }

  /**
   * Subscribe to specified topics
   */
}

main().catch(err => console.error('[command-listener]', err));
