// Thin wrapper: the analytics logic lives in analytics-core.js; the Node adapter feeds it plain JSON.
const { createAnalytics } = require('./analytics-core.js');
const { nodeAdapter } = require('./mongo-adapter');

const cache = new WeakMap();
function forDb(db) {
  if (!cache.has(db)) cache.set(db, createAnalytics(nodeAdapter(db)));
  return cache.get(db);
}

module.exports = {
  overview: (db, days) => forDb(db).overview(days),
  listUsers: (db, q) => forDb(db).listUsers(q),
  userDetail: (db, id, days) => forDb(db).userDetail(id, days),
};
