module.exports = function (RED) {
  'use strict';
  var mustache = require('mustache');
  var sql = require('mssql');

  function connection(config) {
    RED.nodes.createNode(this, config);

    var node = this;
    this.config = {
      user: node.credentials.username,
      password: node.credentials.password,
      domain: node.credentials.domain,
      server: config.server,
      port: config.port ? parseInt(config.port) : 1433,
      database: config.database,
      connectionTimeout: config.requestTimeout ? parseInt(config.connectionTimeout) : 15000,
      requestTimeout: config.requestTimeout ? parseInt(config.requestTimeout) : 15000,
      options: {
        encrypt: config.encyption,
        useUTC: config.useUTC
      },
      pool: {
        max: config.pool ? parseInt(config.pool): 10,
        min: 0,
        idleTimeoutMillis: config.poolTimeout ? parseInt(config.poolTimeout) : 15000
      },
    };


    this.connection = sql;
    node.on('close', function () {
      node.pool.close(() => { });
    })
  }

  RED.nodes.registerType('MSSQL-CN', connection, {
    credentials: {
      username: { type: 'text' },
      password: { type: 'password' },
      domain: { type: 'text' }
    }
  });

  function mssql(config) {
    RED.nodes.createNode(this, config);
    var mssqlCN = RED.nodes.getNode(config.mssqlCN);
    this.query = config.query;
    this.connection = mssqlCN.connection;
    this.config = mssqlCN.config;
    this.outField = config.outField;

    var node = this;
    var b = node.outField.split('.');
    var i = 0;
    var r = null;
    var m = null;
    var rec = function (obj) {
      i += 1;
      if ((i < b.length) && (typeof obj[b[i - 1]] === 'object')) {
        rec(obj[b[i - 1]]); // not there yet - carry on digging
      }
      else {
        if (i === b.length) { // we've finished so assign the value
          obj[b[i - 1]] = r;
          node.send(m);
          node.status({});
        }
        else {
          obj[b[i - 1]] = {}; // needs to be a new object so create it
          rec(obj[b[i - 1]]); // and carry on digging
        }
      }
    };

    node.on('input', function (msg) {
      console.log(node.config);
      const sql = node.connection;

      sql.connect(node.config)
        .then(pool => {

          node.status({ fill: 'blue', shape: 'dot', text: 'requesting' });

          var query = mustache.render(node.query, msg);

          if (!query || (query === '')) {
            query = msg.payload;
          }

          return pool.request()
            .query(query)
            .then(result => {
              i = 0;
              r = result.recordset;
              m = msg;
              rec(msg);
            }).catch(err => {
              node.error(err, msg);
              node.status({ fill: 'red', shape: 'ring', text: 'Error query' });
              return;
            });

        }).catch((err) => {
          node.error(err, msg);
          node.status({ fill: 'red', shape: 'ring', text: 'Error connection' });
          return;
        });
    });

  }
  RED.nodes.registerType('MSSQL', mssql);
};
