// import { getCooccurrenceId } from '../CreateOrUpdateCooccurrence';

// const fixture1 = {
//   userId: 'user1',
//   appId: 'app1',
//   articleIds: [
//     'a1',
//     'a2',
//   ],
// };

// const fixture2 = {
//   userId: 'user2',
//   appId: 'app1',
//   articleIds: [
//     'a1',
//     'a3',
//   ],
// };

export default {
  [`/articles/doc/a1`]: {
    text: "i am a1",
    replyRequestCount: 3,
    references: [{ type: 'LINE' }],
  },
  [`/articles/doc/a2`]: {
    text: "i am a2",
    replyRequestCount: 1,
    references: [{ type: 'LINE' }],
  },
  // [`/articles/doc/${getCooccurrenceId(fixture1)}`]: fixture1,
  // [`/articles/doc/${getCooccurrenceId(fixture2)}`]: fixture2,
};
