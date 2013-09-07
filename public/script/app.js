"use strict";

function HomeController($scope) {
	$scope.active = 'tasks';
}

function TasksController($scope) {
	$scope.showComplete = false;

	$scope.tasks = [
		{
			title: 'Do big thing',
			amount: 1.00,
			coach: 'Greg',
			dueDate: new Date(2013, 9, 10),
			completed: false
		},
		{
			title: 'Finish the hack',
			amount: 1.00,
			coach: 'Viraj',
			dueDate: new Date(2013, 9, 10),
			completed: false
		},
		{
			title: 'Do small thing',
			amount: 0.50,
			coach: 'Glen',
			dueDate: new Date(2013, 9, 7, 4, 41, 0),
			completed: true
		}
	];
}

function TaskController($scope) {

	this.toggleExpanded = function() {
		$scope.isExpanded = !$scope.isExpanded;
	};
}
