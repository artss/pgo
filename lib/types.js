var sys = require('sys');

/**
 *  Basic type
 */
function Type (params){
    if (params && params.default) {
        this.default = params.default;
    }
    this.escape = function(value){
        if (value === null || typeof(value) == 'undefined') {return 'NULL';}
        return value;
    };
    this.required = (params && params.required);
}

/**
 * Integer type
 */
function Integer (params) {
    Type.apply(this, arguments);
    this.sql_type = 'integer';
    if (params && typeof params.min == 'number') {
        this.min = params.min;
    }
    if (params && typeof params.max == 'number') {
        this.max = params.max;
    }
    this.escape = function(value){
        if (value === null || typeof(value) == 'undefined') {return 'NULL';}
        if (typeof(value) != "number") {
            throw new Error(value+": not a number");
        }
        return value;
    };
}

/**
 *  Float type
 */
function Float (params) {
    Integer.apply(this, arguments);
    this.sql_type = 'integer';
}

/**
 *  Primary key type
 */
function Key () {
    Integer.apply(this, arguments);
    this.sql_type = 'serial primary key';
}

/**
 *  String (varchar) type
 */
function Str (params) {
    Integer.apply(this, arguments);
    if (!this.max) {
        this.max = 255;
    }
    if (params && params.re instanceof RegExp) {
        this.re = params.re;
    } else if (params && typeof params.re == 'string') {
        this.re = new RegExp(params.re);
    }
    this.sql_type = 'varchar('+this.max+')';
    this.escape = function(value){
        if (value === null || typeof(value) == 'undefined') {return 'NULL';}
        value = value.replace(/([\\\'])/g, '\\$1');
        return "'"+value+"'";
    };
}

/**
 *  Text type
 */
function Text (params) {
    Str.apply(this, arguments);
    this.sql_type = 'text';
}

/**
 *  Boolean type
 */
function Bool () {
    Type.apply(this, arguments);
    this.sql_type = 'boolean';
    this.escape = function(value){
        if (value === null || typeof(value) == 'undefined') {return 'NULL';}
        if (value) return 'TRUE';
        return 'FALSE';
    }
}

/**
 *  Datetime type
 */
function Datetime (params) {
    Type.apply(this, arguments);
    if (params && params.min instanceof Date) {
        this.min = params.min;
    }
    if (params && params.max instanceof Date) {
        this.max = params.max;
    }
    this.sql_type = 'datetime';
    this.escape = function(value){
        if (value === null || typeof(value) == 'undefined') {return 'NULL';}
        if (value instanceof Date) {
            var year = value.getFullYear();
            var mon = value.getMonth() + 1;
            if (mon < 10) mon = '0'+mon.toString();
            var day = value.getDate();
            if (day < 10) day = '0'+day.toString();
            var hour = value.getHours();
            if (hour < 10) hour = '0'+hour.toString();
            var min = value.getMinutes();
            if (min < 10) min = '0'+min.toString();
            var sec = value.getSeconds();
            if (sec < 10) sec = '0'+sec.toString();
            return "'"+year+'-'+mon+'-'+day+' '+hour+':'+min+':'+sec+"'";
        }
        if (value.match(/^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}:\d{2}(\.\d+)?)?$/)) {
            return "'"+value+"'";
        }
        throw new Error(value+": invalid time");
    }
}

/**
 *  Foreign key
 */
function ForeignKey (model, field, type) {
    if (!model.key) {
        throw new Error(model.table+" has no primary key");
    }
    this.model = model;
    this.field = field;
    this.type = type;
}

module.exports = {
    'Type': Type,
    'Key': Key,
    'ForeignKey': ForeignKey,
    'Str': Str,
    'Text': Text,
    'Integer': Integer,
    'Float': Float,
    'Bool': Bool,
    'Datetime': Datetime
};

