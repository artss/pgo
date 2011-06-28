var sys = require('sys');
var types = require(__dirname+'/types');

function keys (obj){
    var list = [];
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) {
            continue;
        }
        list.push(i);
    }
    return list;
};

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

    for (var key in data) {
        if (data[key] instanceof Model) {
            this.fields[key+'_'+data[key].key] = data[key];
            this.fkeys[key] = new types.ForeignKey(data[key],
                                                   key+'_'+data[key].key);

        } else if (data[key] instanceof types.ForeignKey) {
            this.fields[data[key].field] = data[key].model;
            this.fkeys[key] = data[key];

        } else if (data[key] instanceof types.Key) {
            this.key = key;
            this.fields[key] = data[key];

        } else {
            this.fields[key] = data[key];
        }
    }

    if (!this.key && !this.fields.id) {
        this.key = 'id';
        this.fields.id = new types.Key;
    }

    var self = this, jtbl;

    this.fkfields = {};
    for (var key in this.fkeys) {
        jtbl = this.fkeys[key].model.table+'_'+this.fkeys[key].field;
        keys(this.fkeys[key].model.fields).map(function(k){
            self.fkfields[key+'__'+k] = jtbl+'.'+k;
        });
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
 *
 *  @param callback         Function that should be called when the query
 *                          is finished.
 *                          Adopts the list of rows.
 *
 *  @param errback          Function that shoud be called if the query fails.
 *                          Adopts the error object.
 */
Model.prototype.find = function(params, opts, callback, errback){
    var self = this;

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
            //if (this.fkeys[key].type == 'one') {
                jtbl = this.fkeys[key].model.table+'_'+this.fkeys[key].field;
                joins += ' join '+this.fkeys[key].model.table+' as '+jtbl+' on '+
                           jtbl+'.'+this.fkeys[key].model.key+'='+
                           this.table+'_tbl'+'.'+this.fkeys[key].field;
            //}
        }
    }
    query += ' from '+this.table+' as '+this.table+'_tbl'+joins;

    try {
        query += ' where '+build_where(this, params);
    } catch (e) {
        errback(e);
    }

    if (opts.order) {
        if (!(opts.order instanceof Array)) opts.order = [opts.order];

        var cols = [], col = '', sort = 'asc';
        for (var i=0; i<opts.order.length; i++) {
            if (opts.order[i].indexOf('-') == 0) {
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
    if (opts.offset) query += ' offset '+opts.offset;
    if (opts.limit) query += ' limit '+opts.limit;

    var rows = [];
    var q = this.db.query(query);
    q.on('row', function(row){
        for (var column in row) {
            var m = column.match(/^([a-z0-9]+)__([a-z0-9]+)$/i);
            if (m) {
                var ref = m[1];
                var refcol = m[2];
                if (!(ref in row)) row[ref] = {};
                row[ref][refcol] = row[column];
                delete row[column];
            }
        }

        row = new Row(self, row, false);
        rows.push(row);
    });
    q.on('end', function(){
        rows.query = query;
        if (callback) callback(rows);
    });
    q.on('error', function(error){
        error.query = query;
        if (errback) errback(error);
    });
};

/**
 *  Similar to .find() method, but gets a single row.
 */
Model.prototype.get = function(params, opts, callback, errback){
    opts.limit = 1;
    this.find(params, opts, function(result){
        if (result.length > 0) {
            callback(result[0]);
        } else {
            callback(null);
        }
    }, errback);
};

/**
 *  Insert a row.
 */
Model.prototype.add = function(row, callback, errback){
    if (!(row instanceof Row)) {
        row = new Row(this, row);
    }
    try {
        row.save(callback, errback);
    } catch (e) {
        if (errback) errback(e);
    }
    return row;
};

/**
 *  Model row class.
 *
 *  @param  model      Owner model.
 *  @param  data       Row data (according to model fields).
 *  @param  check      Check on existence of the object before saving
 *                     in case of the primary key (id) is set.
 *                     Default is TRUE.
 */
function Row (model, data, check) {
    if (typeof(check) == 'undefined') {
        this.check = true;
    } else {
        this.check = Boolean(check);
    }
    this.model = model;

    for (var key in data) {
        this[key] = data[key];
    }
}

/**
 *  Insert/update row.
 */
Row.prototype.save = function(callback, errback){
    var self = this;

    var query = '', fields = [], values = [], on_row, on_end;

    for (var k in this.model.fields) {
        if (this.model.fields[k].required && !this[k]) {
            throw new Error(k+': required field');
        }
        if (k in this && k != this.model.key) {
            fields.push(k);
            values.push(this.model.fields[k].escape(this[k]));
        }
    }

    for (k in this.model.fkeys) {
        if (k in this) {
            this[this.model.fkeys[k].field]
                            = this[k][this.model.fkeys[k].model.key];
            fields.push(this.model.fkeys[k].field);
            values.push(
                this.model.fkeys[k].model.fields[this.model.fkeys[k].model.key]
                .escape(this[this.model.fkeys[k].field])
            );
        }
    }

    var save = function(){
        if (self[self.model.key]) {
            // update
            query = 'update '+self.model.table+' set ';

            for (var i=0; i<fields.length; i++) {
                values[i] = fields[i] + '=' + values[i];
            }

            query += values.join(', ')+' where '+self.model.key+'='+
                     self.model.fields[self.model.key].escape(self[self.model.key]);

            on_row = function(row){
                sys.puts('ROW: '+sys.inspect(row));
            };
            on_end = function(){
                self.check = false;
                if (callback) callback();
            };

        } else {
            // insert
            query = 'insert into '+self.model.table+' ('+fields.join(', ')+') '+
                    'values ('+values.join(', ')+') returning *;';
            on_row = function(row){
                for (var i in row) {
                    self[i] = row[i];
                }
            };
            on_end = function(){
                self.check = false;
                if (callback) callback(self);
            };
        }

        var q = self.model.db.query(query);

        q.on('row', on_row);
        q.on('end', on_end);

        q.on('error', function(error){
            error.query = query;
            if (errback) errback(error);
        });
    }

    if (this.check && this[this.model.key]) {
        var cond = {};
        cond[this.model.key] = this[this.model.key];
        this.model.get(cond, {}, function(obj){
            if (!obj) {
                delete self[self.model.key];
            }
            save();
        });
    } else {
        save();
    }
};

exports.Model = Model;
exports.Row = Row;

/**
 *  Internal function. Builds the 'where' clause of SQL queries.
 */
function build_where (self, params, operator){
    if (!operator) operator = 'and';

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
        if (p == '$or') {
            conds.push('('+build_where(self, params[p], 'or')+')');
            continuel

        } else if (p == '$not') {
            conds.push('('+build_where(self, params[p], 'not')+')');
            continue;

        } else if (p == '$gt') {
            conds.push(build_where(self, params[p], 'gt'));
            continue;

        } else if (p == '$lt') {
            conds.push(build_where(self, params[p], 'lt'));
            continue;

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
                    return (new types.Str).escape(value.toString())
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

    return conds.join(' '+operator+' ');
};

