import { getTodayYYYYMMDD } from '../fetchStatsFromGA';

/**
 * Bigquery schemas
 */
export const GA4_SCHEMA = {
  fields: [
    { name: 'event_name', type: 'STRING' },
    { name: 'event_date', type: 'STRING' },
    { name: 'event_timestamp', type: 'INTEGER' },
    { name: 'user_pseudo_id', type: 'STRING' },
    { name: 'stream_id', type: 'STRING' },
    {
      name: 'items',
      type: 'RECORD',
      mode: 'REPEATED',
      fields: [
        { name: 'item_id', type: 'STRING' },
        { name: 'item_category', type: 'STRING' },
      ],
    },
    {
      name: 'collected_traffic_source',
      type: 'RECORD',
      fields: [{ name: 'manual_source', type: 'STRING' }],
    },
  ],
};

/**
 * Bigquery fixtures
 */
export const events_20230601 = [
  {
    event_name: 'view_item',
    event_date: '20230601',
    event_timestamp: '1685618315997928',
    user_pseudo_id: 'user01',
    stream_id: 'website',
    items: [
      { item_id: 'reply1', item_category: 'Reply' },
      { item_id: 'article1', item_category: 'Article' },
    ],
  },
  {
    event_name: 'view_item',
    event_date: '20230601',
    event_timestamp: '1685580882953067',
    user_pseudo_id: 'user01',
    stream_id: 'website',
    items: [
      { item_id: 'reply1', item_category: 'Reply' },
      { item_id: 'article2', item_category: 'Article' },
    ],
  },
];

export const events_20230602 = [
  {
    event_name: 'view_item',
    event_date: '20230602',
    event_timestamp: '1685704715000000',
    user_pseudo_id: 'user02',
    stream_id: 'liff',
    items: [
      { item_id: 'reply1', item_category: 'Reply' },
      { item_id: 'article1', item_category: 'Article' },
    ],
    collected_traffic_source: { manual_source: 'downstream-bot-1' },
  },
  {
    event_name: 'view_item',
    event_date: '20230602',
    event_timestamp: '1685704725000000',
    user_pseudo_id: 'user03',
    stream_id: 'liff',
    items: [{ item_id: 'article1', item_category: 'Article' }],
    collected_traffic_source: { manual_source: 'downstream-bot-2' },
  },
];

export const events_today = [
  {
    event_name: 'view_item',
    event_date: getTodayYYYYMMDD('Asia/Taipei'),
    event_timestamp: `${Date.now() * 1000}`,
    user_pseudo_id: 'user01',
    stream_id: 'liff',
    items: [
      { item_id: 'reply1', item_category: 'Reply' },
      { item_id: 'article1', item_category: 'Article' },
    ],
    collected_traffic_source: { manual_source: 'downstream-bot-1' },
  },
];

export const events = [
  {
    createdAt: '2023-06-01 00:33:33.479000 UTC',
    events: [
      {
        time: '2023-06-01 00:33:33.478000 UTC',
        category: 'Article',
        action: 'Selected',
        label: 'article1',
        value: null,
      },
    ],
    userId: 'lineUser1',
  },
];

/**
 * Elasticsearch fixtures
 */
export default {
  '/articles/doc/article1': {
    text: 'text',
    userId: 'articleAuthorId',
    appId: 'articleAuthorApp',
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  // Existing stats; shall be overwritten by new ones
  '/analytics/doc/article_article2_2023-06-01': {
    stats: {},
  },
};
