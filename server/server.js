#!/usr/bin/env node

const PCOL="https";
const HOST="centivize.co";
const PORT=80;

const SECRET = require("./secret.json");
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

function s4() {
   return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
};

function guid() {
   return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
}

var express = require('express'),
    app = express(),
    dwolla = require('dwolla'),
    fs = require('fs'),
    https = require('https'),
    redis = require('redis').createClient(),
    restler = require('restler'),
    url = require('url');

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



app.get("/api/pay", function(req, res) {
    var urlinfo = url.parse(req.url, true).query;
    dwollaPay(req.session.email, query.pin, query.amount, function(status) {
        // ???
    });
});

app.get("/api/tasklist", function(req, res) {
    var urlinfo = url.parse(req.url, true).query;
    getTasks(req.session.email, function(tasks) {
        // ???
    });
});

app.post("/api/addtask", function(req, res) {
    console.log(req.body);
});




function dwollaPay(uid, pin, amount, callback) {
    redis.get("user:" + uid + ":dwollatoken", function(err, res) {
        if (err) {
            callback(undefined);
            return;
        }
        dwolla.send(res, pin, CONFIG.DWOLLA.RECV_ACCOUNT, amount, function(err, data) {
            if (err) {
                callback(undefined);
                return;
            }
            callback(true);
        });
    });
}



function getTasks(uid, callback) {
    redis.smembers("user:" + uid + ":taskids", function(err, res) {
        if (err) {
            callback(undefiend);
            return;
        }
        var tasks = [];
        for (var i = 0; i < res.length; i++) {
            redis.hgetall("tasks:" + res[i], function(err, task) {
                tasks.push(err ? undefined : task);
                if (tasks.length === res.length) {
                   callback(tasks);
                   return;
                }
            });
        }
    });
}

function addTask(uid, task, callback) {
   taskid = guid();
   var multi = redis.multi();
   multi.sadd("user:" + uid + ":taskids", taskid, function(err, res) {
         if (err) {
            callback(undefined);
            return;
         }
      });
   for (var field in task) {
      multi.hset("tasks:" + taskid, task[field]['key'], task[field]['value'], function(err, res) {
            if (err) {
               callback(undefined);
               return;
            }
      });
   }
   multi.exec(function(err, res) {
         if (err) {
            callback(undefined);
            return;
         }
      });
   return;
}
