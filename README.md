# PGO

Yet another javasctipt/node.js ORM for PostgreSQL.
Uses [node-postgres](https://github.com/brianc/node-postgres).

## How to use

PGO is quite simple and easy to use. To start using it, just do it:

    var pgo = require('pgo');

    var db = new pgo.Db('tcp://user:password@host.tld/database');

### Creating models

Suppose we have two tables:

    CREATE TABLE users (
      id serial primary key,
      "login" character varying(64),
      "name" character varying(255),
      about text,
      created timestamp without time zone DEFAULT now()
    );
    CREATE INDEX users_created_idx ON users(created);
    CREATE UNIQUE INDEX users_login_idx ON users(login);

    CREATE TABLE posts (
      id serial primary key,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created timestamp without time zone DEFAULT now(),
      private boolean DEFAULT false,
      "text" text
    );
    CREATE INDEX posts_created_idx ON posts(created);
    CREATE INDEX posts_user_id_idx ON posts(user_id);

Thus their models should look like this:

    var User = new pgo.Model(db, 'users', {
        login: new pgo.types.Str({min: 2, max: 64, required: true}),
        name: new pgo.types.Str({min: 2, max: 255}),
        about: new pgo.types.Text({min: 5, max: 4096, required: true}),
        created: new pgo.types.Datetime
    });

    var Post = new pgo.Model(db, 'posts', {
        user: new pgo.types.ForeignKey(User, 'user_id'),
        created: new pgo.types.Datetime,
        text: new pgo.types.Text({default: 'test post'}),
        private: new pgo.types.Bool({default: false})
    });

### Getting objects

To get objects from database, use [Model.find()](https://github.com/artss/pgo/blob/master/lib/model.js#L105)
and [Model.get()](https://github.com/artss/pgo/blob/master/lib/model.js#L187) methods.
These methods work similarly, but .get() returns single Row instance instead of rows list.

#### Methods' arguments:

1. **params** — Query conditions. Examples:

 * Equality:

            {"name": "username"}                        name = 'username'
            {"id": [1, 2, 3, 4]}                        id in (1, 2, 3, 4)

 * Inequality:

            {"$not": {"name": "username"}}              name != 'username'
            {"$not": {"id": [1, 2, 3, 4]}}              id not in (1, 2, 3, 4)

 * Disjunction:

            {"$or": {"name": "username", "id": 1}}      name = 'username' or id=1

 * Conditional operators:

            {"$lt": {"age": 29}}                        age < 29
            {"$gt": {"birthdate": "1982-01-23"}}        birthdate > '1982-01-23'

2. **options** — Query options.

 * Limit/offset:

            {"limit": 10}                               limit 10
            {"offset": 100}                             offset 100

 * Rows order:

            {"order": "birthdate"}                      order by birthdate asc

        or

            {"order": "-birthdate"}                     order by birthdate desc

        for ordering by multiple columns:

            {"order": ["-birthdate", "name"]}           order by birthdate desc, name asc

3. **callback** — Function that should be called when the query is finished. Adopts the list of rows.

4. **errback** — Function that shoud be called if the query fails. Adopts the error object.

#### Example

    User.get({id:3456}, {}, function(user){
        if (!user) return;
        sys.puts('User: '+sys.inspect(user));
        Post.find({user:user, '$gt':{'created': '2011-03-20'}, private: true},
            {limit: 10, order: '-created'},
            function(posts){
                for (var i=0; i<posts.length; i++) {
                    sys.puts(posts[i].id+'\t'+posts[i].user.login+'\t'+posts[i].text);
            }
        }, function(e){
            sys.puts('Error:', sys.inspect(e));
        });
    }, function(e){
        sys.puts('No such user');
    });

### Creating objects

You can manually create a [Row](https://github.com/artss/pgo/blob/master/lib/row.js) instance:

    var user = new pgo.Row({login: 'arts', name: 'Artem Sazhin', about: 'Some stuff'});

and manually save it:

    user.save(function(){
        sys.puts('User '+user.login+' successfully created at '+user.created);
    }, function(e){
        sys.puts('Error:', sys.inspect(e));
    });

or pass object to [Model.add()](https://github.com/artss/pgo/blob/master/lib/model.js#L208) method:

    Post.add({user: user, text: 'Post text'},
        function(post){
            sys.puts('Post:', sys.inspect(post));
        }, function(e){
            sys.puts('Error:', sys.inspect(e));
        });

### Updating objects

[Row.save()](https://github.com/artss/pgo/blob/master/lib/row.js#L26)
also saves the existing rows (checks if primary key (usually 'id' field) is set).

    User.get({id: 3456}, {}, function(user){
        if (user) {
            user.about = 'Changed description';
            user.save(function(){
                sys.puts('User updated: '+sys.inspect(user));
            }, errback);
        }
    }, errback);

### Deleting objects

To delete multiple rows, you can use [Model.delete()](https://github.com/artss/pgo/blob/master/lib/model.js#L222):

    User.delete({id: [10001, 10002]}, function(posts){
        sys.puts('Posts deleted: '+sys.inspect(posts));
    }, errback);

To delete a single row, just call [Row.delete()](https://github.com/artss/pgo/blob/master/lib/row.js#L116) method:

    user.delete(function(user){
        sys.puts('User deleted: '+sys.inspect(user));
    }, errback);

*Note: primary key must be set in the object.*

The rows will be deleted from database, but still will be available through the object passed to callback,
so you can restore it if you need.

