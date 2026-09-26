// Node adapter for analytics-core: converts extended-JSON filters ({$oid}, {$date})
// into BSON and normalises results back to plain JSON values.
const mongodb = require('mongodb');
const { fromEjson } = require('./analytics-core.js');

const EJSON = (mongodb.BSON && mongodb.BSON.EJSON) || require('bson').EJSON;
const toBson = (v) => (v == null ? v : EJSON.deserialize(v, { relaxed: true }));
const fromBson = (docs) => fromEjson(EJSON.serialize(docs, { relaxed: true }));

function nodeAdapter(db) {
  return {
    async aggregate(collection, pipeline) {
      return fromBson(await db.collection(collection).aggregate(toBson(pipeline)).toArray());
    },
    async find(collection, filter = {}, opts = {}) {
      let cursor = db.collection(collection).find(toBson(filter));
      if (opts.projection) cursor = cursor.project(opts.projection);
      if (opts.sort) cursor = cursor.sort(opts.sort);
      if (opts.limit) cursor = cursor.limit(opts.limit);
      return fromBson(await cursor.toArray());
    },
    async findOne(collection, filter = {}, opts = {}) {
      const rows = await this.find(collection, filter, { ...opts, limit: 1 });
      return rows[0] || null;
    },
    async count(collection, filter = {}) {
      return db.collection(collection).countDocuments(toBson(filter));
    },
  };
}

module.exports = { nodeAdapter };
