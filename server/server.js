#!/usr/bin/env node

"use strict";

var dwolla = require('dwolla'),
    express = require('express'),
    fs = require('fs'),
    https = require('https'),
    redis = require('redis').createClient(),
    restler = require('restler'),
    url = require('url');

var app = express();

var PCOL="https";
var HOST="centivize.co";
var PORT=80;

var SECRET = require("./secret.json");
var CONFIG = {
    DWOLLA: {
        ID: "NCmLk7qYgDeu+wxCbjmt7178/upeGgzeD/HNPWIiLX2CH4zI9+",
        SCOPE: "Balance|Send",
        AUTH_CALLBACK: "https://centivize.co/dwolla/auth/callback",
        PAY_CALLBACK: "https://centivize.co/dwolla/payment/callback",
        RECV_ACCOUNT: "000-000-0000"
    }
};
CONFIG.DWOLLA.SECRET = SECRET.DWOLLA;

function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16).substring(1);
    };
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

https.createServer({key: fs.readFileSync('./sslcert/server.key', 'utf8'),
                    cert:fs.readFileSync('./sslcert/server.crt', 'utf8')},
                   app);

app.use(express.bodyParser())
    .use(express.cookieParser())
    .use(express.session({secret:"mozillapersona"}));

require('express-persona')(app, {
    audience: PCOL+"://"+HOST+":"+PORT,
    verifyPath: "/persona/verify",
    logoutPath: "/persona/logout"
});


app.get("/dwolla/auth", function(req, res) {
    var authUrl = 'https://www.dwolla.com/oauth/v2/authenticate?response_type=code' +
            '&client_id=' + encodeURIComponent(CONFIG.DWOLLA.ID) +
            '&redirect_uri=' + encodeURIComponent(CONFIG.DWOLLA.AUTH_CALLBACK) + 
            '&scope=' + encodeURIComponent(CONFIG.DWOLLA.SCOPE);
});
app.get(url.parse(CONFIG.DWOLLA.AUTH_CALLBACK).pathname, function(req, res) {
    restler.get("https://www.dwolla.com/oauth/v2/token", {
        query: {
            client_id: CONFIG.DWOLLA.ID,
            client_secret: CONFIG.DWOLLA.SECRET,
            grant_type: "authorization_code",
            redirect_uri: CONFIG.DWOLLA.AUTH_CALLBACK,
            code: req.query.code
        }
    }).on('complete', function(data) {
        redis.set("user:" + req.session.email + ":dwollatoken", data.access_token);
    });
});

/*
 * Returns a canonical key for uid's list of taskids.
 */
function userTasksKey(uid) {
   return "user:" + uid + ":taskids";
}

/*
 * Returns a canonical key for the hash for taskid.
 */
function taskKey(taskid) {
   return "tasks:" + taskid;
}


app.get("/api/tasklist", function(req, res) {
    getTasks(req.session.email, function(tasks) {
        // ???
    });
});

app.post("/api/addtask", function(req, res) {
    console.log(req.body);
    addTask(req.session.email, req.body, function(taskid) {
        // ???
        payTask(taskid, req.body.pin, function(success) {
            // ???
        });
    });
});

app.post("/api/pay", function(req, res) {
    payTask(query.taskid, req.body.pin, function(success) {
        // ???
    });
});

function payTask(taskid, pin, callback) {
    redis.get(taskKey(taskid), function(err, task) {
        if (err) {
            callback(undefined);
            return;
        }
        redis.get("user:" + task.uid + ":dwollatoken", function(err, token) {
            if (err) {
                callback(undefined);
                return;
            }
            dwolla.send(token, pin, CONFIG.DWOLLA.RECV_ACCOUNT, task.value, function(err, data) {
                if (err) {
                    callback(undefined);
                    return;
                }
                callback(true);
            });
        });
    });
}

/*
 * Performs callback on the list of tasks belonging to uid.
 */
function getTasks(uid, callback) {
   redis.smembers(userTasksKey(uid), function(err, res) {
        if (err) {
            callback(undefiend);
            return;
        }
        var tasks = [];
        for (var i = 0; i < res.length; i++) {
           redis.hgetall(taskKey(res[i]), function(err, task) {
                tasks.push(err ? undefined : task);
                if (tasks.length === res.length) {
                   callback(tasks);
                   return;
                }
            });
        }
    });
}

/*
 * Adds task to the list of tasks owned by uid. Also adds a new hash for task.
 * Returns the id generated for the task or -1 if there was an error.
 */
function addTask(uid, task, callback) {
    var taskid = guid();
    var taskkey = taskKey(taskid);
    var multi = redis.multi();
    multi.sadd(userTasksKey(uid), taskid, function(err, res) {
        if (err) {
            callback(undefined);
            return;
        }
    });
    multi.hmset(taskkey,
                'uid', uid,
                'name', task['name'],
                'time', task['time'],
                'value', task['value'],
                'currency', task['currency'],
                'verifier', task['verifier'],
                'description', task['description'],
                'paid', '0',
                'uid', uid,
                function(err, res) {
                    if (err) {
                        callback(undefined);
                        return;
                    }
                });
    multi.exec(function(err, res) {
        if (err) {
            callback(undefined);
            return -1;
         }
      });
   return taskid;
}

/*
 * Removes taskid from uid's task list and removes the hash for taskid.
 */
function removeTask(uid, taskid, callback) {
   var multi = redis.multi();
   multi.srem(userTasksKey(uid), taskid, function(err, res) {
         if (err) {
            callback(undefined);
            return;
         }
      });
   multi.del(taskKey(taskid), function(err, res) {
         if (err) {
            callback(undefined);
            return;
         }
      });
   multi.exec(function(err, res) {
         if (err) {
            callback(undefined);
            return;
        }
        callback(taskid);
    });
    return;
}
