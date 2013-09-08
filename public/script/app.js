"use strict";

var app = angular.module("centivize", ["ngResource"]);

app.factory("Task", function($resource) {
	return $resource("/tasks/:taskId", {}, {
		index: {method: "GET", isArray: true},
		destroy: { method: "DELETE" },
		create: {method: "GET"}
	});
});

function HomeController($scope) {
	$scope.active = "tasks";
}

function TasksController($scope) {
	$scope.showComplete = false;

	$scope.tasks = [
		{
			title: 'Do big thing',
			amount: 1.00,
			coach: 'Greg',
			dueDate: new Date(2013, 9, 10),
			completed: false,
			description: 'Praesent commodo cursus magna, vel scelerisque nisl consectetur et. Sed posuere consectetur est at lobortis. Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. Donec id elit non mi porta gravida at eget metus.'
		},
		{
			title: 'Finish the hack',
			amount: 1.00,
			coach: 'Viraj',
			dueDate: new Date(2013, 9, 14),
			completed: false,
			description: ''
		},
		{
			title: 'Do small thing',
			amount: 0.50,
			coach: 'Glen',
			dueDate: new Date(2013, 9, 7, 4, 41, 0),
			completed: true,
			description: '',
		}
	];

	$scope.toggleExpand = function(task) {
		task.isExpanded = !task.isExpanded;
	}
}

function TaskController($scope) {

}
