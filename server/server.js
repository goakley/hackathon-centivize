var redis = require('redis').createClient();

function s4() {
   return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
};

function guid() {
   return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
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
   redis.sadd("user:" + uid + ":taskids", taskid, function(err, res) {
         if (err) {
            callback(undefined);
            return;
         }
      });
   for (var field in task) {
      redis.hset("tasks:" + taskid, task[field]['key'], task[field]['value'], function(err, res) {
            if (err) {
               callback(undefined);
               return;
            }
      });
   }

    return;
}


addTask(0, [{key: "name", value: "Groceries"},
            {key: "time", value: "Monday"},
            {key: "value", value: "10"},
            {key: "currency", value: "USD"},
            {key: "coach", value: "Viraj"},
            {key: "description", value: "Milk and eggs, bitch"}],
        function(response) { console.dir(JSON.stringify(response)); });
getTasks(0, function(response) { console.dir(JSON.stringify(response)); });
