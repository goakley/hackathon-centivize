var redis = require('redis').createClient();



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

function addTask(uid, task, callbacks) {
}

getTasks(0, function(response) { console.log(response); });
