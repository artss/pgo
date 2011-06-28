var sys = require('sys');
var pg = require('pg').native;


/**
 *  'pg' module wrapper, connections pool.
 *
 *  @param  conn_str    Connection string.
 *                      e.g.: tcp://user:password@host.tld/database
 */
function Db (conn_str) {
    this.conn_str = conn_str;
    this.pool_size = 10;

    this.pool = [];
    this.connections = 0;

    for (var i=0; i<this.pool_size; i++) {
        this.put_connection(this.get_connection());
    }
}

/**
 *  Execute an SQL query.
 *
 *  @param  query     SQL query string.
 */
Db.prototype.query = function(query){
    var self = this;

    var client = this.get_connection();

    var q = client.query(query);
    q.on('end', function(){
        self.put_connection(client);
    });
    q.on('error', function(e){
        self.put_connection(client);
    });
    return q;
};

/**
 *  Get connection from pool.
 */
Db.prototype.get_connection = function(){
    var client = this.pool.pop();
    if (!client) {
        client = new pg.Client(this.conn_str);
        client.connect();
        this.connections++;
    }
    return client;
}

/**
 *  Put connection back to pool.
 *
 *  @param client     Connection instance.
 */
Db.prototype.put_connection = function(client){
    if (this.connections > this.pool_size) {
        client.end();
        this.connections--;
        delete client;
    } else {
        this.pool.push(client);
    }
};

exports.Db = Db;

