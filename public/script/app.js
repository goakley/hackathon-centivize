"use strict";

function TasksController($scope) {
	$scope.active = 'tasks';
	$scope.showComplete = false;

	$scope.tasks = [
		{
			title: 'Do big thing',
			amount: 1.00,
			coach: 'Greg',
			completed: false
		},
		{
			title: 'Finish the hack',
			amount: 1.00,
			coach: 'Virage',
			completed: false
		},
		{
			title: 'Do small thing',
			amount: 0.50,
			coach: 'Glen',
			completed: true
		}
	];
}

function TaskController($scope) {

	this.toggleEditing = function() {
		console.log('blah');
	};
}

TaskController.prototype.toggleEditing = function() {
	console.log('blarg');
};
