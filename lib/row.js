/**
 *  Row class.
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
        if (obj.hasOwnProperty(i)) {
            this[key] = data[key];
        }
    }
}

/**
 *  Insert/update row.
 */
Row.prototype.save = function(callback, errback){
    var self = this;

    var query = '', fields = [], values = [], on_row, on_end;

    for (var k in this.model.fields) {
        if (obj.hasOwnProperty(i)) {
            if (this.model.fields[k].required && !this[k]) {
                throw new Error(k+': required field');
            }
            if (k in this && k != this.model.key) {
                fields.push(k);
                values.push(this.model.fields[k].escape(this[k]));
            }
        }
    }

    for (k in this.model.fkeys) {
        if (k in this) {
            this[this.model.fkeys[k].field] =
                            this[k][this.model.fkeys[k].model.key];
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
            };

            on_end = function(){
                self.check = false;
                if (callback) {
                    callback(self);
                }
            };

        } else {
            // insert
            query = 'insert into '+self.model.table+' ('+fields.join(', ')+') '+
                    'values ('+values.join(', ')+') returning *;';
            on_row = function(row){
                for (var i in row) {
                    if (obj.hasOwnProperty(i)) {
                        self[i] = row[i];
                    }
                }
            };
            on_end = function(){
                self.check = false;
                if (callback) {
                    callback(self);
                }
            };
        }

        // TODO: check constraints

        var q = self.model.db.query(query);

        q.on('row', on_row);
        q.on('end', on_end);

        q.on('error', function(error){
            error.query = query;
            if (errback) {
                errback(error);
            }
        });
    };

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

/**
 *  Delete row
 */
Row.prototype.delete = function(callback, errback){
    if (!(this.model.key in this)) {
        if (errback) {
            errback(new Error('Primary key ('+this.model.key+') is not set'));
        }
    }

    var query = 'delete from '+this.model.table+' where '+this.model.key+'='+
                this.model.fields[this.model.key].escape(this[this.model.key])+
                ' returning *;';

    var q = this.model.db.query(query);

    var data;

    q.on('row', function(row){
        data = row;
    });

    q.on('end', function(){
        data.query = query;
        if (callback) {
            callback(data);
        }
    });

    q.on('error', function(error){
        error.query = query;
        if (errback) {
            errback(error);
        }
    });
};

exports.Row = Row;

