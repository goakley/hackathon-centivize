#!/usr/bin/env node

"use strict";


/*****************************************************************************/
/* CONFIG */

var SECRET = require("./secret.json");
var CONFIG = {
    SERVER: {
        HOST: "centivize.co",
        PORT: 443,
        REDIRECT_PORT: 80
    },
    DWOLLA: {
        ID: "NCmLk7qYgDeu+wxCbjmt7178/upeGgzeD/HNPWIiLX2CH4zI9+",
        SCOPE: "Balance|Send",
        AUTH_CALLBACK: "https://centivize.co/dwolla/auth/callback",
        PAY_CALLBACK: "https://centivize.co/dwolla/payment/callback",
        RECV_ACCOUNT: "812-528-4968"
    },
    SENDGRID: {
        USER: "centivize"
    }
};
CONFIG.DWOLLA.SECRET = SECRET.DWOLLA;
CONFIG.DWOLLA.RECV_TOKEN = SECRET.RECV_TOKEN;
CONFIG.DWOLLA.RECV_PIN = SECRET.RECV_PIN;
CONFIG.SENDGRID.KEY = SECRET.SENDGRID;

/*****************************************************************************/
/* SETUP */

var dwolla = require('dwolla'),
    ejs = require('ejs'),
    express = require('express'),
    fs = require('fs'),
    http = require('http'),
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

var httpsserver = https.createServer({key: fs.readFileSync('./sslcert/ssl.key', 'utf8'),
                                      cert:fs.readFileSync('./sslcert/ssl.crt', 'utf8'),
		                      ca:fs.readFileSync('./sslcert/sub.class1.server.ca.pem', 'utf8')},
                                     app).listen(CONFIG.SERVER.PORT);

http.createServer(function (req, res) {
    res.writeHead(301, {
        Location: 'https://' + CONFIG.SERVER.HOST + req.url
    });
    res.end("");
}).listen(CONFIG.SERVER.REDIRECT_PORT);

app.use(express.logger())
    .use(express.bodyParser())
    .use(express.cookieParser())
    .use(express.session({secret:"mozillapersona"}))
    .use(function(req, res, next) {
        var pathname = url.parse(req.url).pathname;
        if (req.session.email) {
            redis.get("user:" + req.session.email + ":dwollatoken", function(err, token) {
                if (!token && pathname !== url.parse(CONFIG.DWOLLA.AUTH_CALLBACK).pathname) {
                    var authUrl = 'https://www.dwolla.com/oauth/v2/authenticate?response_type=code' +
                            '&client_id=' + encodeURIComponent(CONFIG.DWOLLA.ID) +
                            '&redirect_uri=' + encodeURIComponent(CONFIG.DWOLLA.AUTH_CALLBACK) + 
                            '&scope=' + encodeURIComponent(CONFIG.DWOLLA.SCOPE);
                    res.redirect(authUrl);
                    return;
                } else {
                    if (pathname === '/' || pathname === '/index.html' || pathname === '') {
                        res.redirect(302, '/app.html');
                        return;
                    }
                    next();
                }
                return;
            });
            return;
        } else {
            if (pathname === '/app.html') {
                res.redirect(302, '/');
                return;
            }
            if (pathname.substr(0,4) === '/api') {
                res.send(401);
                return;
            }
            next();
            return;
        }
    })
    .use(express.static('./public'));

require('express-persona')(app, {
    audience: "https://" + CONFIG.SERVER.HOST + ":" + CONFIG.SERVER.PORT
});

/*****************************************************************************/
/* DYNAMIC WEB SERVE */

app.get("/verify/:tid/yes", function(req, res) {
    finishTask(req.params.tid, function(status, err) {
	var message = fs.readFileSync("./templates/verify_completed_" + (err ? "n" : "") + "okay.ejs", 'utf8').toString();
        res.send(ejs.render(message));
    });
});

app.get("/verify/:tid/no", function(req, res) {
    failTask(req.params.tid, function(status, err) {
	var message = fs.readFileSync("./templates/verify_failed_" + (err ? "n" : "") + "okay.ejs", 'utf8').toString();
        res.send(ejs.render(message));
    });
});

/*****************************************************************************/
/* AUTHENTICATION ENDPOINTS */

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
    }).once('complete', function(data) {
        redis.set("user:" + req.session.email + ":dwollatoken", data.access_token, function(err, asdf) {
            res.redirect('/');
        });
    });
});

/*****************************************************************************/
/* WEB API */

/**
 * 200 - Located all the user tasks which are provided
 * 500 - No idea what happened wrong
 */
app.get("/api/task", function(req, res) {
    getTasks(req.session.email, function(status, tasks) {
        if (status !== 200) {
            res.send(500);
        } else {
            res.json(tasks);
        }
    });
});

/**
 * 200 - Created a task for the authenticated user with the resultant 'tid'
 * 500 - No idea what happened wrong
 */
app.post("/api/task", function(req, res) {
    addTask(req.session.email, req.body, req.body.pin, function(status, tid) {
        console.log("GOT RESPONSE " + status);
        if (status !== 200) {
            res.send(500);
        } else {
            res.json({tid:tid});
        }
    });
});

/**
 * 205 - Successfully deleted the task
 * 403 - TID does not belong to the user
 * 404 - TID not found
 * 500 - Server error
 */
app.del("/api/task/:tid", function(req, res) {
    var tid = req.params.tid;
    redis.exists(key_task(tid), function(err, doesexist) {
        if (!doesexist) {
            res.send(404);
            return;
        }
        redis.smembers(key_user_tids(req.session.email), function(err, tids) {
            if (err) {
                res.send(500);
                return;
            }
            var found = false;
            for (var i = 0; i < tids.length; i++) {
                if (tids[i] === tid) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                res.send(403);
                return;
            }
            finishTask(tid, function(success) {
                res.send(success ? 205 : 500);
            });
        });
    });
});

/**
 * 205 - Okay, marked as completed
 * 404 - Bad tid
 * 500 - Server error
 */
app.post("/api/task/:tid/complete", function(req, res) {
    var tid = req.params.tid;
    if (!tid) {
        res.send(404);
        return;
    }
    redis.exists(key_task(tid), function(err, doesexist) {
        if (!doesexist) {
            res.send(404);
            return;
        }
	redis.zadd("taskqueue", 0, tid, function(err, val) {
	    if (err) {
		res.send(500);
		return;
	    }
	    res.send(205);
	    return;
	});
    });
});

/**
 * 200 - User as a JSON object
 * 500 - Server error
 */
app.get("/api/user", function(req, res) {
    redis.hgetall(key_user(req.session.email), function(err, user) {
        if (err) {
            res.send(500);
        } else {
            if (!user)
                user = {};
            user.email = req.session.email;
            res.json(user);
        }
    });
});

/**
 * req should be {key: value, ...}
 * 205 - Successfully updated the provided field
 * 500 - Server error
 */
app.post("/api/user", function(req, res) {
    var arr = [key_user(req.session.email)];
    for (var key in req.body) {
        var value = req.body[key];
        arr.push(key, value);
    }
    redis.hmset(arr, function(err, resp) {
        res.send(err ? 500 : 205);
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
    if (!pin) {
        callback(400, "PIN is falsy");
        return;
    }
    redis.hgetall(key_task(tid), function(err, task) {
        if (err) {
            callback(500, err);
            return;
        }
        redis.get(key_user(task.uid) + ":dwollatoken", function(err, token) {
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
    redis.hgetall(key_task(tid), function(err, task) {
        if (err) {
            callback(500, err);
            return;
        }
        if (task.paid === '0') {
            callback(200);
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

function sendToCharity(tid, callback) {
    redis.hgetall(key_task(tid), function(err, task) {
	if (err) {
	    callback(500, err);
	    return;
	}
	if (task.paid === '0') {
	    callback(200);
	    return;
	}
	redis.hget(key_user(task.uid), 'charity', function(err, charity) {
	    dwolla.send(CONFIG.DWOLLA.RECV_TOKEN, CONFIG.DWOLLA.RECV_PIN, charity, task.value, function(err, data) {
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
    });
}

/*****************************************************************************/
/* EXTERNAL NOTIFICATIONS */

/* Alerts the coach that they are now coaching the given task */
function alertCoach(tid, callback) {
    redis.hgetall(key_task(tid), function(err, task) {
	if (err) {
	    callback(500, err);
	    return;
	}
	var email = fs.readFileSync("./templates/email_coach_alert.ejs", 'utf8').toString();
	var emailtext = ejs.render(email, {user:task.uid,
					   task:task.name,
					   description:task.description});
	sendgrid.send({
            to: task.cid,
            from: task.uid,
            subject: task.uid + " Has Selected You as Their Coach",
            html: emailtext
	}, function(err, response) {
            if (err) {
		callback(500, err);
		return;
            }
            callback(200);
	});
    });
}

/*
 * Sends the coach for tid an email asking them to confirm if the user was
 *  successful/unsuccessful in their attempt to accomplish tid.
 */
function sendCoachEmail(tid, callback) {
    redis.hgetall(key_task(tid), function(err, task) {
	if (err) {
	    callback(500, err);
	    return;
	}
	if (task.completed) {
	    sendCoachSuccessEmail(task, function(err, res) {
		if (err) {
		    callback(500, err);
		    return;
		}
		callback(200);
	    });
	}
	else {
	    sendCoachFailEmail(task, function(err, res) {
		if (err) {
		    callback(500, err);
		    return;
		}
		callback(200);
	    });
	}
    });
}

function sendCoachSuccessEmail(task, callback) {
    var email = fs.readFileSync("./templates/email_coach_completed.ejs", 'utf8').toString();
    var emailtext = ejs.render(email, {user:task.uid,
				      task:task.name,
				      description:task.description,
                                      expiration:task.date,
                                      approval:"https://" + CONFIG.SERVER.HOST + ":" + CONFIG.SERVER.PORT + "/verify/" + task.tid + "/yes",
                                      denial:"https://" + CONFIG.SERVER.HOST + ":" + CONFIG.SERVER.PORT + "/verify/" + task.tid + "/no"});
    sendgrid.send({
        to: task.cid,
        from: task.uid,
        subject: task.uid + " Has Completed a Task",
        html: emailtext
    }, function(err, response) {
        if (err) {
            callback(500, err);
            return;
        }
        callback(200);
    });
}

function sendCoachFailEmail(task, callback) {
    var email = fs.readFileSync("./templates/email_coach_failed.ejs", 'utf8').toString();
    var emailtext = ejs.render(email, {user:task.uid,
				      task:task.name,
				      description:task.description,
                                      expiration:task.date,
                                      approval:"https://" + CONFIG.SERVER.HOST + ":" + CONFIG.SERVER.PORT + "/verify/" + task.tid + "/yes",
                                      denial:"https://" + CONFIG.SERVER.HOST + ":" + CONFIG.SERVER.PORT + "/verify/" + task.tid + "/no"});
    sendgrid.send({
        to: task.cid,
        from: task.uid,
        subject: task.uid + " Has not Completed a Task",
        html: emailtext
    }, function(err, response) {
        if (err) {
            callback(500, err);
            return;
        }
        callback(200);
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
        if (!res.length) {
            callback(200, []);
            return;
        }
        var tasks = [];
        for (var i = 0; i < res.length; i++) {
            redis.hgetall(key_task(res[i]), function(err, task) {
                tasks.push(err || !task ? undefined : task);
		if (!task) {
		    redis.srem(key_user_tids(uid), function(err, res) {})
		}
                if (tasks.length === res.length) {
                    for (var j = 0; j < tasks.length; j++) {
                        if (tasks[j] !== undefined && tasks[j].paid === '0') {
                            finishTask(tasks[j].tid, function(){});
                            tasks[j] = undefined;
                        }
                    }
                    callback(200, tasks.filter(function(v){return v !== undefined;}));
                    return;
                }
            });
        }
    });
}


function addTask(uid, task, pin, callback) {
    console.log("TASK!!!");
    var tid = guid();
    var taskkey = key_task(tid);
    var multi = redis.multi();
    multi.zadd("taskqueue", task.time, tid);
    multi.sadd(key_user_tids(uid), tid);
    multi.hmset(taskkey,
                'name', task.name,
                'date', task.date,
                'value', task.value,
                'currency', "USD",
                'cid', task.cid,
                'description', task.description,
                'paid', '0',
		'completed', false,
		'tid', tid,
                'uid', uid);
    multi.exec(function(err, res) {
        if (err) {
            finishTask(tid, function(){});
            callback(500, err);
            return;
        }
        console.log("WE ARE OKAY AFTER MULTI EXEC");
	alertCoach(tid, function(code, err) {
	    if (code !== 200) {
		finishTask(tid, function(){});
		callback(500, err);
		return;
	    }
	    obtainMoney(tid, pin, function(code, err) {
		if (code !== 200) {
		    console.log(err);
                    finishTask(tid, function(){});
                    callback(500, err);
		} else {
                    callback(200, tid);
		}
	    });
        });	
    });
}

/* Remove a task from the system */
function destroyTask(tid, callback) {
    redis.hget(key_task(tid), 'uid', function(err, uid){
	if (err) {
	    callback(500, err);
	    return;
	}
	var multi = redis.multi();
	multi.srem(key_user_tids(uid), tid);
	multi.del(key_task(tid));
	multi.zrem("taskqueue", tid);
	multi.zrem("pendingqueue", tid);
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

/* Successfully complete a task */
function finishTask(tid, callback) {
    redis.hget(key_task(tid), 'paid', function(err, paid) {
	if (err) {
	    callback(500, err);
	    return;
	}
	if (paid) {
	    releaseMoney(tid, function(status, err) {
		if (status !== 200) {
		    callback(500, err);
		    return;
		}
		destroyTask(tid, callback);
		return;
	    });
	}
	destroyTask(tid, callback);
    });
}

/* Unsuccessfully complete a task */
function failTask(tid, callback) {
    sendToCharity(tid, function(status, err) {
	if (status != 200) {
	    callback(500, err);
	    return;
	}
	destroyTask(tid, callback);
    });
}

var robotTQ;
(function checkTaskQueue() {
    redis.zrange("taskqueue", 0, 0, "WITHSCORES", function(err, head) {
        if (err) {
            robotTQ = setTimeout(checkTaskQueue, 60000);
            return;
        }
        if (!head.length) {
            robotTQ = setTimeout(checkTaskQueue, 60000);
            return;
        }
        if (parseInt(head[1]) > Date.now()) {
            if (parseInt(head[1]) - Date.now() > 60000)
                robotTQ = setTimeout(checkTaskQueue, 60000);
            else
                robotTQ = setTimeout(checkTaskQueue, parseInt(head[1])-Date.now());
            return;
        }
	sendCoachEmail(head[0], function(err, res) {
	    if (err) {
		return;
	    }
            redis.zadd("pendingqueue", head[1], head[0], function(err, status) {
		if (err) {
                    robotTQ = setTimeout(checkTaskQueue, 1000);
                    return;
		}
		redis.zrem("taskqueue", head[1], head[0], function(err, status) {
                    if (err) {
			robotTQ = setTimeout(checkTaskQueue, 1000);
			return;
                    }
                    checkTaskQueue();
		});
            });
	});
    });
})();

var robotPQ;
(function checkPendingQueue() {
    redis.zrange("pendingqueue", 0, 0, "WITHSCORES", function(err, head) {
        if (err) {
            robotPQ = setTimeout(checkPendingQueue, 60000);
            return;
        }
        if (!head.length) {
            robotPQ = setTimeout(checkPendingQueue, 60000);
            return;
        }
        if (parseInt(head[1]) > Date.now()) {
            if (parseInt(head[1]) - Date.now() > 60000)
                robotPQ = setTimeout(checkTaskQueue, 60000);
            else
                robotPQ = setTimeout(checkTaskQueue, parseInt(head[1])-Date.now());
            return;
        }
        finishTask(head[0], function(status, err) {
            if (status !== 200) {
                robotPQ = setTimeout(checkTaskQueue, 1000);
                return;
            }
            checkTaskQueue();
        });
    });
})();
