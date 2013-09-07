#!/usr/bin/env node

const PCOL="http";
const HOST="centivize.co";
const PORT=80;

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
    redis = require('redis').createClient();

app.use(express.bodyParser())
    .use(express.cookieParser())
    .use(express.session({secret:"mozillapersona"}));

require('express-persona')(app, {
    audience: PCOL+"://"+HOST+":"+PORT,
    verifyPath: "/persona/verify",
    logoutPath: "/persona/logout"
});

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
