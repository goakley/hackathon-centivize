"use strict";

var app = angular.module("centivize", ["ngResource"]);

app.factory("Task", function($resource) {
	return $resource("/api/task/:tid", {tid: "@tid"}, {
		index: {method: "GET", isArray: true},
		destroy: {method: "DELETE"},
		save: {
			method: "POST",
			transformRequest: function(d, headersGetter) {
				return JSON.stringify({
					name: d.name,
					description: d.description,
					date: new Date(d.date).getTime(),
					value: Number(d.value.replace('$', '')),
					cid: d.cid,
					pin: d.pin
				});
			}
		},
		complete: {
			method: "POST",
			url: "/api/task/:tid/complete"
		}
	});
});

app.factory("User", function($resource) {
	return $resource("/api/user", {}, {
		get: {method: "GET"},
		update: {method: "POST"}
	});
});

function HomeController($scope) {
	$scope.active = "tasks";

	$scope.toggleMenu = function() {
		$scope.menuExpanded = !$scope.menuExpanded;
	};
}

var defaultTask = {
	name: 'New Task',
	value: '1.00',
	cid: '', // coach email address
	date: '', // ms
	pin: '',
	description: ''
};

var tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

function TasksController($scope, Task) {
	$scope.showComplete = false;

	$scope.tasks = Task.index();
	$scope.newTask = angular.copy(defaultTask);

	$scope.toggleExpand = function(task) {
		task.isExpanded = !task.isExpanded;
	};

	$scope.create = function(task) {
		if (!task.name) {
			task.error = "Name your task.";
			return;
		}
		task.error = "";
		Task.save({}, task, function(resource) {
			// success
			task.tid = resource.tid;
			$scope.tasks.push(task);
			// reset the form
			$scope.newTask = angular.copy(defaultTask);
		}, function(response) {
			task.error = "There was a problem creating your task.";
		});
	};

	$scope.destroy = function(task) {
		Task.destroy({tid: task.tid}, function(resource) {
			// success
			task.error = "";
			// remove from list
			var i = $scope.tasks.indexOf(task);
			if (i != -1) {
				$scope.tasks.splice(i, 1);
			}
		}, function(response) {
			task.error = "There was a problem deleting your task.";
		});
	};

	$scope.complete = function(task) {
		Task.complete({tid: task.tid}, function(resource) {
			// success
			task.error = "";
		}, function(response) {
			task.error = "There was a problem completing your task.";
		});
	};

}

var charities = [
	/*
	{name: 'CFY', domain: 'cfy.org'},
	{name: 'charity: water', domain: 'charitywater.org'},
	{name: 'DonorsChoose.org', domain: 'donorschoose.org'},
	{name: 'Fuck Cancer', domain: 'letsfcancer.com'},
	{name: 'Goods for Good', domain: 'goodsforgood.org'},
	{name: 'hackNY', domain: 'hackny.org'},
	{name: 'iMentor', domain: 'imentor.org'},
	{name: 'Kiva', domain: 'kiva.org'},
	{name: 'Pencils of Promise', domain: 'pencilsofpromise.org'},
	{name: 'She\'s the First', domain: 'shesthefirst.org'},
	{name: 'United Way of New York City', domain: 'unitedwaynyc.org'},
	*/
	{name: "Heart4Children Inc.", id: "812-573-9939"},
	{name: "The Tor Project", id: "812-526-5770"},
	{name: "Cloudbase Foundation", id: "812-675-8638"},
	{name: "Goodwill Industries of Arkansas", id: "812-678-3756"},
	{name: "Glen Oakley", id: "812-580-3594"},
	{name: "Greg Owen", id: "812-590-7026"},
	{name: "Charles Lehner", id: "812-580-3594"}
];

function SettingsController($scope, User) {
	$scope.charities = charities;
	$scope.settings = User.get();
	$scope.error = "";

	$scope.save = function() {
		User.update($scope.settings, function(resource) {
			// success
			$scope.error = "";
		}, function(response) {
			$scope.error = "There was a problem saving your settings.";
		});
	};
}
