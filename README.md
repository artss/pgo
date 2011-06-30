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

To get objects from database, use [Model](https://github.com/artss/pgo/wiki/Model).find()
and [Model](https://github.com/artss/pgo/wiki/Model).get() methods.
These methods work similarly, but .get() returns single Row instance instead of rows list.

#### Example

    User.get({id:3456}, {})
        .on('get', function(user){
            if (!user) return;
            console.log('User: '+user);

            var n = 0;
            Post.find({user:user, '$gt':{'created': '2011-03-20'}, private: true},
                {limit: 10, order: '-created'})
                .on('row', function(post){
                    console.log(post.id, post.user.login, post.text);
                    n++;
                })
                .on('end', function(){
                    console.log(n + ' posts found.');
                })
                .on('error', function(e){
                    console.log('Error:', e);
                });
        })
        .on('error', function(e){
            console.log('Error:', e);
        });

### Creating objects

You can manually create a [Row](https://github.com/artss/pgo/wiki/Row) instance:

    var user = new pgo.Row({login: 'arts', name: 'Artem Sazhin', about: 'Some stuff'});

and manually save it:

    user.save()
        .on('end', function(){
            sys.puts('User '+user.login+' successfully created at '+user.created);
        })
        .on('error', function(e){
            sys.puts('Error:', sys.inspect(e));
        });

or pass object to [Model](https://github.com/artss/pgo/wiki/Model).add() method:

    Post.add({user: user, text: 'Post text'})
        .on('end', function(post){
            sys.puts('Post:', sys.inspect(post));
        })
        .on('error', function(e){
            sys.puts('Error:', sys.inspect(e));
        });

### Updating objects

[Row](https://github.com/artss/pgo/wiki/Row).save()
also saves the existing rows (checks if primary key (usually 'id' field) is set).

    User.get({id: 3456}, {})
        .on('end', function(user){
            if (user) {
                user.about = 'Changed description';
                user.save()
                    .on('end', function(){
                        sys.puts('User updated: '+sys.inspect(user));
                    })
                    .on('error', errback);
            }
        })
        .on('error', errback);

### Deleting objects

To delete multiple rows, you can use [Model](https://github.com/artss/pgo/wiki/Model).delete():

    User.delete({id: [10001, 10002]})
        .on('end', function(){
            sys.puts('Posts deleted');
        })
        .on('error', errback);

To delete a single row, just call [Row](https://github.com/artss/pgo/wiki/Row).delete() method:

    user.delete()
        .on('end', function(user){
            console.log('User deleted: ', user);
        })
        .on('error', errback);

*Note: primary key must be set in the object.*

