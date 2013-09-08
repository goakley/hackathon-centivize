"use strict";

var app = angular.module("centivize", ["ngResource"]);

app.factory("Task", function($resource) {
	return $resource("/api/task/:tid", {}, {
		index: {method: "GET", isArray: true},
		destroy: { method: "DELETE" },
		create: {method: "GET"}
	});
});

function HomeController($scope) {
	$scope.active = "tasks";
}

function TasksController($scope, Task) {
	$scope.showComplete = false;

	var tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);

	$scope.newTask = {
		title: 'Untitled Task',
		amount: 1.00,
		coach: 'yomomma@example.org',
		dueDate: tomorrow,
		description: '',
		completed: false
	};

	$scope.tasks = [
		{
			tid: 1,
			title: 'Do big thing',
			amount: 1.00,
			coach: 'Greg',
			dueDate: new Date(2013, 9, 10),
			completed: false,
			description: 'Praesent commodo cursus magna, vel scelerisque nisl consectetur et. Sed posuere consectetur est at lobortis. Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. Donec id elit non mi porta gravida at eget metus.'
		},
		{
			tid: 2,
			title: 'Finish the hack',
			amount: 1.00,
			coach: 'Viraj',
			dueDate: new Date(2013, 9, 14),
			completed: false,
			description: ''
		},
		{
			tid: 3,
			title: 'Do small thing',
			amount: 0.50,
			coach: 'Glen',
			dueDate: new Date(2013, 9, 7, 4, 41, 0),
			completed: true,
			description: '',
		}
	];

	$scope.settings = [
		{
			title: 'First Name',
			status: 'Viraj'
		},
		{
			title: 'Last Name',
			status: 'Viraj'
		}
	];

	$scope.toggleExpand = function(task) {
		task.isExpanded = !task.isExpanded;
	};

	$scope.create = function(task) {
		if (!task.title) {
			task.error = "Name your task.";
			return;
		}
		task.error = "";
		Task.save({}, task, function(resource) {
			console.log("saved", resource);
			$scope.tasks.push(resource);
			task.error = "";
		}, function(response) {
			task.error = "There was a problem creating your task.";
		});
	};

	$scope.destroy = function(task) {
		Task.destroy(task, function(resource) {
			console.log("destroyed");
			task.error = "";
			// kill it
		}, function(response) {
			task.error = "There was a problem deleting your task.";
		});
	};

	$scope.complete = function(task) {
		task.error = "Todo";
	};

}
