#!/usr/bin/env node

"use strict";


/*****************************************************************************/
/* CONFIG */

var SECRET = require("./secret.json");
var CONFIG = {
    DWOLLA: {
        ID: "NCmLk7qYgDeu+wxCbjmt7178/upeGgzeD/HNPWIiLX2CH4zI9+",
        SCOPE: "AccountInfoFull|Balance|Send",
        AUTH_CALLBACK: "https://centivize.co/dwolla/auth/callback",
        PAY_CALLBACK: "https://centivize.co/dwolla/payment/callback",
        RECV_ACCOUNT: "812-528-4968"
    },
    SENDGRID: {
        USER: "centivize"
    }
};
CONFIG.DWOLLA.SECRET = SECRET.DWOLLA;
CONFIG.SENDGRID.KEY = SECRET.SENDGRID;

var HOST="centivize.co";
var PORT=80;

/*****************************************************************************/
/* SETUP */

var dwolla = require('dwolla'),
    express = require('express'),
    fs = require('fs'),
    https = require('https'),
    redis = require('redis').createClient(),
    restler = require('restler'),
    sendgrid = require('sendgrid')(CONFIG.SENDGRID.USER, CONFIG.SENDGRID.KEY),
    url = require('url');

var app = express();

/*****************************************************************************/

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
                   app).listen(443);

app.use(express.bodyParser())
    .use(express.cookieParser())
    .use(express.session({secret:"mozillapersona"}))
    .use(express.static('../public'));

require('express-persona')(app, {
    audience: "https://" + HOST + ":" + PORT,
    verifyPath: "/persona/verify",
    logoutPath: "/persona/logout"
});

/*****************************************************************************/
/* DYNAMIC WEB SERVE */

app.get("/verify/:tid/yes", function(req, res) {
    finishTask(tid, function(status, err) {
        res.send("");
    });
});

app.get("/verify/:tid/no", function(req, res) {
    failTask(tid, function(status, err) {
        res.send("");
    });
});

/*****************************************************************************/
/* AUTHENTICATION ENDPOINTS */

/* Dwolla authentication endpoint */
app.get("/dwolla/auth", function(req, res) {
    var authUrl = 'https://www.dwolla.com/oauth/v2/authenticate?response_type=code' +
            '&client_id=' + encodeURIComponent(CONFIG.DWOLLA.ID) +
            '&redirect_uri=' + encodeURIComponent(CONFIG.DWOLLA.AUTH_CALLBACK) + 
            '&scope=' + encodeURIComponent(CONFIG.DWOLLA.SCOPE);
});
/* Dwolla autentication callback - NOT CALLED DIRECTLY */
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

/*****************************************************************************/
/* WEB API */

app.get("/api/tasks", function(req, res) {
    getTasks(req.session.email, function(status, tasks) {
        if (status !== 200) {
            res.json({"err":"ERROR"});
        } else {
            res.json(tasks);
        }
    });
});

app.post("/api/task", function(req, res) {
    console.log(req.body);
    addTask(req.session.email, req.body, function(status, tid) {
        if (status !== 200) {
            res.json({"err":"ERROR"});
        } else {
            res.json({"tid":tid});
        }
    });
});

app.del("/api/task/:tid", function(req, res) {
    finishTask(tid, function(success) {
        if (!success) {
            res.json({"err":"ERROR"});
        } else {
            res.json({"success":true});
        }
    });
});

/*****************************************************************************/
/* KEY_ functions */

function key_user(uid) { return "user:" + uid; }
function key_task(tid) { return "task:" + tid; }
function key_user_tids(uid) { return key_user(uid) + ":tids"; }

/*****************************************************************************/
/* PAYMENT HANDLING */

function obtainMoney(tid, pin, callback) {
    redis.get(key_task(tid), function(err, task) {
        if (err) {
            callback(500, err);
            return;
        }
        redis.get(key_user(task_id) + ":dwollatoken", function(err, token) {
            if (err) {
                callback(500, err);
                return;
            }
            redis.hset(key_task(tid), 'paid', '1', function(err, nothingofimportance) {
                if (err) {
                    callback(500, err);
                    return;
                }
                dwolla.send(token, pin, CONFIG.DWOLLA.RECV_ACCOUNT, task.value, function(err, data) {
                    if (err) {
                        callback(500, err);
                        return;
                    }
                    callback(200);
                });
            });
        });
    });
}

function releaseMoney(tid, callback) {
    redis.get(key_task(tid), function(err, task) {
        if (err) {
            callback(500, err);
            return;
        }
        dwolla.send(CONFIG.DWOLLA.RECV_TOKEN, CONFIG.DWOLLA.RECV_PIN, task.uid, task.value, function(err, data) {
            if (err) {
                callback(500, err);
                return;
            }
            redis.hset(key_task(tid), 'paid', '0', function(err, nothingofimportance) {
                if (err) {
                    callback(500, err);
                    return;
                }
                callback(200);
            });
        });
    });
}

/*****************************************************************************/
/* EXTERNAL NOTIFICATIONS */

/*
 * Sends the coach for uid's task tid an email asking them to confirm if
 *  uid was successful/unsuccessful in their attempt to accomplish tid.
 */
function sendCoachEmail(uid, tid, successful, callback) {
    redis.get(key_task(tid), function(err, task) {
	if (err) {
	    callback(500, err);
	    return;
	}
	
    });
}

/*****************************************************************************/
/* TASK MANAGERS */

/* Lists all the tasks for a user.  If a user has an unpaid task, the task is
 * removed */
function getTasks(uid, callback) {
    redis.smembers(key_user_tids(uid), function(err, res) {
        if (err) {
            callback(500, err);
            return;
        }
        var tasks = [];
        for (var i = 0; i < res.length; i++) {
            redis.hgetall(key_task(res[i]), function(err, task) {
                tasks.push(err ? undefined : task);
                if (tasks.length === res.length) {
                    for (var j = 0; j < tasks.length; j++) {
                        if (tasks[j] !== undefined && tasks[j].paid === '0') {
                            finishTask(tasks[j].tid, function(){});
                            tasks[j] = undefined;
                        }
                    }
                    callback(200, task.filter(function(v){return v !== undefined;}));
                    return;
                }
            });
        }
    });
}

function addTask(uid, task, pin, callback) {
    var tid = guid();
    var taskkey = key_task(tid);
    var multi = redis.multi();
    multi.sadd(key_user_tids(uid), tid);
    multi.hmset(taskkey,
                'name', task['name'],
                'time', task['time'],
                'value', task['value'],
                'currency', task['currency'],
                'verifier', task['verifier'],
                'description', task['description'],
                'paid', '0',
                'uid', uid);
    multi.exec(function(err, res) {
        if (err) {
            finishTask(tid, function(){});
            callback(500, err);
            return;
        }
        obtainMoney(tid, req.body.pin, function(success, err) {
            if (!success) {
                finishTask(tid, function(){});
                callback(500, err);
            } else {
                callback(200, tid);
            }
        });
    });
}

/* Successfully complete a task */
function finishTask(tid, callback) {
    releaseMoney(tid, function(status, err) {
        if (status !== 200) {
            callback(500, err);
            return;
        }
        var multi = redis.multi();
        multi.srem(key_user_tids(tid['uid']), tid);
        multi.del(key_task(tid));
        multi.exec(function(err, res) {
            if (err) {
                callback(500, err);
                return;
            }
            callback(200);
        });
        return;
    });
}

/* Unsuccessfully complete a task */
function failTask(tid, verified, callback) {
    var multi = redis.multi();
    multi.srem(key_user_tids(tid['uid']), tid);
    multi.del(key_task(tid));
    multi.exec(function(err, res) {
        if (err) {
            callback(500, err);
            return;
        }
        callback(200);
    });
    return;
}









/*
 function printRes(res) {
 console.log(res);
 }

 var uid = CONFIG.DWOLLA.ID;
 var groceries = addTask(uid, {name: "Groceries", time: UNIXTIMESTAMP, value: 10, 
 currency: "USD", coach: "Glen",
 description: "Milk and eggs"}, printRes);
 var victory = addTask(uid, {name: "Win PennApps", time: UNIXTIMESTAMP, value: 1000, 
 currency: "USD", coach: "Glen",
 description: "centivize kicks ass"}, printRes);
 getTasks(uid, printRes);
 removeTask(groceries, printRes);
 getTasks(uid, printRes);
 */
