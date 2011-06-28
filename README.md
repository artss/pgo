# PGO

Yet another javasctipt/node.js ORM for PostgreSQL.
Uses [node-postgres](https://github.com/brianc/node-postgres).

## How to use

PGO is quite simple and easy to use. To start using it, just do it:

    var pgo = require('pgo');

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

    var user = new pgo.Row({login: 'arts', name: 'Artem Sazhin', about: 'Some stuff'});
    user.save(function(){
        sys.puts('User '+user.login+' successfully created at '+user.created);
    }, function(e){
        sys.puts('Error:', sys.inspect(e));
    });

or:

    Post.add({user: user, text: 'Post text'},
        function(post){
            sys.puts('Post:', sys.inspect(post));
        }, function(e){
            sys.puts('Error:', sys.inspect(e));
        });

