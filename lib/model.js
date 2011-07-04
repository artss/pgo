var EventEmitter = require('events').EventEmitter;

var sys = require('sys');

var types = require(__dirname + '/types');

var Row = require(__dirname + '/row').Row;

function keys (obj) {
    var list = [];
    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            list.push(i);
        }
    }
    return list;
}

/**
 *  Data model
 *
 *  @param db      pgo.Db instance
 *  @param table   table name
 *  @param data    fields object
 */
function Model (db, table, data) {
    this.db = db;
    this.table = table;

    this.fields = {};
    this.fkeys = {};

    for (var field in data) {
        if (data[field] instanceof Model) {
            this.fields[field+'_'+data[field].key] = data[field];
            this.fkeys[key] = new types.ForeignKey(data[field],
                                                   key+'_'+data[field].key);

        } else if (data[field] instanceof types.ForeignKey) {
            this.fields[data[field].field] = data[field].model;
            this.fkeys[field] = data[field];

        } else if (data[field] instanceof types.Key) {
            this.key = field;
            this.fields[field] = data[field];

        } else {
            this.fields[field] = data[field];
        }
    }

    if (!this.key && !this.fields.id) {
        this.key = 'id';
        this.fields.id = new types.Key();
    }

    var self = this, jtbl;

    this.fkfields = {};

    for (var key in this.fkeys) {
        if (this.fkeys.hasOwnProperty(key)) {
            jtbl = this.fkeys[key].model.table+'_'+this.fkeys[key].field;
            keys(this.fkeys[key].model.fields).map(function(k){
                self.fkfields[key+'__'+k] = jtbl+'.'+k;
            });
        }
    }
}

/**
 *  Find rows list
 *
 *  @param params   Query conditions. Examples:
 *
 *      Equality:
 *      {"name": "username"}                        name = 'username'
 *      {"id": [1, 2, 3, 4]}                        id in (1, 2, 3, 4)
 *
 *      Inequality:
 *      {"$not": {"name": "username"}}              name != 'username'
 *      {"$not": {"id": [1, 2, 3, 4]}}              id not in (1, 2, 3, 4)
 *
 *      Disjunction:
 *      {"$or": {"name": "username", "id": 1}}      name = 'username' or id=1
 *
 *      Conditional operators:
 *      {"$lt": {"age": 29}}                        age < 29
 *      {"$gt": {"birthdate": "1982-01-23"}}        birthdate > '1982-01-23'
 *
 *  @param options   Query options.
 *
 *      Limit/offset:
 *      {"limit": 10}                               limit 10
 *      {"offset": 100}                             offset 100
 *
 *      Row order:
 *      {"order": "birthdate"}                      order by birthdate asc
 *      or
 *      {"order": "-birthdate"}                     order by birthdate desc
 *      or multiple:
 *      {"order": ["-birthdate", "name"]}           order by birthdate desc,
 *                                                           name asc
 */
Model.prototype.find = function(params, opts){
    var self = this;

    var emitter = new EventEmitter();

    var fields = keys(this.fields).map(function(k){
        return self.table+'_tbl.'+k;
    });
    var query = 'select '+fields.join(',');

    var joins = '';

    if (keys(this.fkfields).length) {
        query += ','+keys(this.fkfields).map(function(k){
            return self.fkfields[k]+' as '+k;
        }).join(',');
        for (var key in this.fkeys) {
            if (this.fkeys.hasOwnProperty(key)) {
                jtbl = this.fkeys[key].model.table+'_'+this.fkeys[key].field;
                joins += ' join '+this.fkeys[key].model.table+' as '+jtbl+' on '+
                           jtbl+'.'+this.fkeys[key].model.key+'='+
                           this.table+'_tbl'+'.'+this.fkeys[key].field;
            }
        }
    }

    query += ' from '+this.table+' as '+this.table+'_tbl'+joins;

    try {
        var where = build_where(this, row);
        if (where) {query += ' where '+where;}
    } catch (e) {
        emitter.emit('error', e);
        return emitter;
    }

    if (opts.order) {
        if (!(opts.order instanceof Array)) {
            opts.order = [opts.order];
        }

        var cols = [], col = '', sort = 'asc';
        for (var i=0; i<opts.order.length; i++) {
            if (opts.order[i].indexOf('-') === 0) {
                col = opts.order[i].substring(1);
                sort = 'desc';
            } else {
                col = opts.order[i];
            }
            if (col in this.fkfields) {
                col = this.fkfields[col];
            }
            cols.push(col+' '+sort);
        }
        query += ' order by '+cols.join(', ');
    }
    if (opts.offset) {query += ' offset '+opts.offset;}
    if (opts.limit) {query += ' limit '+opts.limit;}

    var q = this.db.query(query);

    q.on('row', function(row){
        for (var column in row) {
            if (row.hasOwnProperty(column)) {
                var m = column.match(/^([a-z0-9]+)__([a-z0-9]+)$/i);
                if (m) {
                    var ref = m[1];
                    var refcol = m[2];
                    if (!(ref in row)) {
                        row[ref] = {};
                    }
                    row[ref][refcol] = row[column];
                    delete row[column];
                }
            }
        }

        emitter.emit('row', new Row(self, row, false));
    })
    .on('end', function(){
        emitter.emit('end');
    })
    .on('error', function(error){
        error.query = query;
        emitter.emit('error', error);
    });

    return emitter;
};

/**
 *  Similar to .find() method, but gets a single row.
 */
Model.prototype.get = function(params, opts){
    var emitter = new EventEmitter();

    if (!opts) {opts = {};}
    opts.limit = 1;

    var row = null;

    this.find(params, opts)
        .on('row', function(data){
            row = data;
        })
        .on('end', function(){
            emitter.emit('end', row);
        })
        .on('error', function(e){
            emitter.emit('error', e);
        });

    return emitter;
};

/**
 * Count rows
 */
Model.prototype.count = function(params){
    var emitter = new EventEmitter();

    var query = 'select count(*) from '+this.table+' as '+this.table+'_tbl ';

    query += 'where '+build_where(this, params);

    console.log(query);

    var q = this.db.query(query);

    var cnt = 0;
    q.on('row', function(row){
        cnt = row.count;
    })
    .on('end', function(){
        emitter.emit('end', cnt);
    })
    .on('error', function(e){
        emitter.emit('error', e);
    });

    return emitter;
};

/**
 *  Insert a row.
 */
Model.prototype.add = function(row){
    var emitter = new EventEmitter();

    if (!(row instanceof Row)) {
        row = new Row(this, row);
    }

    row.save()
        .on('end', function(){
            emitter.emit('end', row);
        })
        .on('error', function(e){
            emitter.emit('error', e);
        });

    return emitter;
};

/**
 *  Delete row
 */
Model.prototype.del = function(row){
    var emitter = new EventEmitter();
    var self = this;

    if (row instanceof Row) {
        row.del(callback, errback)
            .on('end', function(){
                emitter.emit('end', row);
            })
            .on('error', function(e){
                emitter.emit('error', e);
            });

    } else {
        var query = 'delete from '+this.table+' as '+this.table+'_tbl';

        try {
            var where = build_where(this, row);
            if (where) {query += ' where '+where;}
        } catch (e) {
            emitter.emit('error', e);
            return emitter;
        }

        var q = this.db.query(query);

        var rows = 0;
        q.on('row', function(row){
            /*for (var column in row) {
                if (row.hasOwnProperty(column)) {
                    var m = column.match(/^([a-z0-9]+)__([a-z0-9]+)$/i);
                    if (m) {
                        var ref = m[1];
                        var refcol = m[2];
                        if (!(ref in row)) {
                            row[ref] = {};
                        }
                        row[ref][refcol] = row[column];
                        delete row[column];
                    }
                }
            }

            row = new Row(self, row, true);
            rows.push(row);*/
            rows++;
        });

        q.on('end', function(){
            emitter.emit('end', rows);
        });

        q.on('error', function(e){
            e.query = query;
            emitter.emit('error', e);
        });
    }

    return emitter;
};


exports.Model = Model;
exports.Row = Row;

/**
 *  Internal function. Builds the 'where' clause of SQL queries.
 */
function build_where (self, params, operator){
    if (!operator) {operator = 'and';}

    var conds = [];

    var o;
    switch (operator) {
        case 'and': case 'or':
            o = '=';
            break;
        case 'not':
            o = '!=';
            break;
        case 'gt':
            o = '>';
            break;
        case 'lt':
            o = '<';
            break;
    }
    var _field, _escape, _val;

    for (var p in params) {
        if (params.hasOwnProperty(p)) {
            if (p == '$and') {
                conds.push('('+build_where(self, params[p], 'and')+')');
                continue;

            } else if (p == '$or') {
                conds.push('('+build_where(self, params[p], 'or')+')');
                continue;

            } else if (p == '$not') {
                conds.push('('+build_where(self, params[p], 'not')+')');
                continue;

            } else if (p == '$gt') {
                conds.push(build_where(self, params[p], 'gt'));
                continue;

            } else if (p == '$lt') {
                conds.push(build_where(self, params[p], 'lt'));
                continue;

            // TODO: between

            } else if (p in self.fields) {
                if (self.fields[p] instanceof Model) {
                    _field = self.table+'_tbl.'+p;
                    _escape = self.fields[p].fields[self.fields[p].key].escape;

                } else {
                    _field = self.table+'_tbl.'+p;
                    _escape = self.fields[p].escape;
                }

            } else if (p in self.fkeys) {
                _field = self.table+'_tbl.'+self.fkeys[p].field;
                _escape = function(value){
                    return self.fkeys[p].model.fields[self.fkeys[p].model.key]
                           .escape(value[self.fkeys[p].model.key]);
                };
            } else {
                var m = p.match(/^([a-z0-9]+)__([a-z0-9]+)$/);
                if (m) {
                    _field = self.fkfields[p];
                    _escape = self.fkeys[m[1]].model.fields[m[2]].escape;
                } else {
                    _field = p;
                    _escape = function(value){
                        if (!value) {value = '';}
                        return (new types.Str()).escape(value.toString());
                    };
                }
            }
            if (params[p] instanceof Array) {
                _val = [];
                for (var i=0; i<params[p].length; i++) {
                    _val.push(_escape(params[p][i]));
                }
                conds.push(_field + ' ' + (o == '=' ? 'in' : 'not in') + ' ' +
                           '(' + _val.join(', ') + ')');
            } else {
                conds.push(_field + o + _escape(params[p]));
            }
        }
    }

    return conds.join(' '+operator+' ');
}

