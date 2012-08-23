var _ = require('underscore'),
	Backbone = require(__dirname + '/../'),
	Dataset = require('./dataset.js');

var Client = Backbone.SDB.Model.extend({
	urlRoot: '/clients'
}, {
	schema: {
		firstName:		String,
		lastName:		String,
		middleInitial:	{type: String, maxLength: 1},
		age:			{type: Number, min: 18, length: 3},
		favoriteColors:	[String],
		latitude:		{type: Number, min: -90, max: 90, precision: 6},
		longitude:		{type: Number, min: -180, max: 180, precision: 6}
	}
});
var Clients = Backbone.SDB.Collection.extend({
	url: '/clients',
	model: Client
});

function compareFn(test, expected) {
	return function(client) {
		var equal = true,
			expected = (expected || clients).get(client.id);
		try {
			if (_.isUndefined(expected)) throw 'Expected not found';
			if (client.get('firstName')		!== expected.get('firstName'))		throw 'Not equal';
			if (client.get('lastName')		!== expected.get('lastName'))		throw 'Not equal';
			if (client.get('middleInitial')	!== expected.get('middleInitial'))	throw 'Not equal';
			if (client.get('age')			!== expected.get('age'))			throw 'Not equal';
			// if (client.get('latitude')		!== expected.get('latitude'))		throw 'Not equal';
			// if (client.get('longitude')		!== expected.get('longitude'))		throw 'Not equal';
			
			var colors = _.sortBy(client.favoriteColors, function(color) {return color;}),
				expectedColors = _.sortBy(expected.favoriteColors, function(color) {return color;});
			if (!_.isEqual(colors, expectedColors)) throw 'Not equal';
		} catch (e) {
			equal = false;
		}
		test.ok(equal, 'Expected client is not the same as the actual client.\nExpected:\n' + JSON.stringify(expected) + '\nActual:\n' + JSON.stringify(client.toJSON()));
	};
}

var clients = new Clients();
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

exports.fullQuery = function(test) {
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

exports.limitedQuery = function(test) {
	var limit = 10;
	test.expect(limit);

	Clients.query({}, {
		limit: limit,
		sdb: {ConsistentRead: true},
		success: function(collection, response) {
			if (collection.length !== limit) test.ok(false, 'The query didn\'t return the expected number of models.');
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

exports.queryByAge = function(test) {
	var expected = new Clients(clients.filter(function(client) {
		return client.get('age') >= 25 && client.get('age') <= 35;
	}));
	test.expect(expected.length);

	Clients.query({
		age: {$between: [25, 35]}
	}, {
		sdb: {ConsistentRead: true},
		success: function(collection, response) {
			if (collection.length !== expected.length) test.ok(false, 'The query returned ' + collection.length + ' models, instead of the expected ' + expected.length);
			else {
				collection.each(function(client) {
					var age = client.get('age');
					test.ok(age >= 25 && age <= 35, 'The age of the client is out of the query range');
				});
			}
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
