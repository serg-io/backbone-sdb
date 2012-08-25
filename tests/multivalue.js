// Test for multi-value attributes

var _ = require('underscore'),
	Backbone = require(__dirname + '/../');

var Client = Backbone.SDB.Model.extend({urlRoot: '/clients'}, {
	schema: {
		firstName:		String,
		lastName:		String,
		middleInitial:	{type: String, maxLength: 1},
		favoriteColors:	[String]
	}
});
var Clients = Backbone.SDB.Collection.extend({
	url: '/clients',
	model: Client
});

var Dataset = {
	clients: [
		{
			firstName: 'Kristina',
			lastName: 'Chung',
			middleInitial: 'H',
			favoriteColors: null
		},
		{
			firstName: 'Paige',
			lastName: 'Chen',
			middleInitial: 'H',
			favoriteColors: [null]
		},
		{
			firstName: 'Sherri',
			lastName: 'Melton',
			middleInitial: 'E',
			favoriteColors: [null, 'purple']
		},
		{
			firstName: 'Gretchen',
			lastName: 'Hill',
			middleInitial: 'I', 
			favoriteColors: ['blue']
		},
		{
			firstName: 'Karen',
			lastName: 'Puckett',
			middleInitial: 'U',
			favoriteColors: ['red', 'green']
		},
		{
			firstName: 'Patrick',
			lastName: 'Song',
			middleInitial: 'O',
			favoriteColors: []
		},
		{
			firstName: 'Elsie',
			lastName: 'Hamilton',
			middleInitial: 'A',
			favoriteColors: ['white', 'brown', 'purple', 'brown']
		}
	]
};
var clients = new Clients();

function compareFn(test, expected) {
	return function(actual) {
		var equal = true,
			expected = expected || clients.get(actual.id);
		try {
			if (_.isUndefined(expected)) throw 'Expected not found';
			if (actual.get('firstName')		!== expected.get('firstName'))		throw 'Not equal';
			if (actual.get('lastName')		!== expected.get('lastName'))		throw 'Not equal';
			if (actual.get('middleInitial')	!== expected.get('middleInitial'))	throw 'Not equal';

			if (expected.get('favoriteColors') === null && actual.get('favoriteColors') !== null) throw 'Not equal';
			else {
				var colors = _.sortBy(actual.favoriteColors, function(color) {return color;}),
					expectedColors = _.sortBy(expected.favoriteColors, function(color) {return color;});
				if (!_.isEqual(colors, expectedColors)) throw 'Not equal';
			}
		} catch (e) {
			equal = false;
		}
		test.ok(equal, 'Expected client is not the same as the actual client.\nExpected:\n' + JSON.stringify(expected) + '\nActual:\n' + JSON.stringify(actual.toJSON()));
	};
}

var len = Dataset.clients.length;

exports.create = function(test) {
	var done = _.after(len, function() { test.done(); });
	test.expect(len);
	
	for (var i = 0; i < len; i++) {
		var client = new Client(Dataset.clients[i]);
		client.save({}, {
			complete: done,
			success: function(client, response) {
				clients.add(client);
				test.ok(true, 'Saved');
			},
			error: function(client, error) {
				test.ok(false, 'Error saving client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	}
};

exports.compare = function(test) {
	test.expect(clients.length);

	Clients.query({}, {
		sdb: {ConsistentRead: true},
		success: function(collection, response) {
			if (collection.length !== clients.length) test.ok(false, 'The query didn\'t return the expected number of models.');
			else collection.each(compareFn(test));
		},
		error: function(collection, error) {
			test.ok(false, 'Error while executing query.\nError:\n' + JSON.stringify(error));
		},
		complete: function(collection, response) {
			test.done();
		}
	});
};

exports.destroy = function(test) {
	var done = _.after(clients.length, function() { test.done(); });
	test.expect(len);

	while (!clients.isEmpty()) {
		clients.pop().destroy({
			complete: done,
			success: function(client, response) {
				test.ok(true, 'Success');
			},
			error: function(client, error) {
				test.ok(false, 'Error destroying client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	}
};
