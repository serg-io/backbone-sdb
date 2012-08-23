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
var clients = [];
	
exports.create = function(test) {
	var len = Dataset.clients.length,
		done = _.after(len, function() { test.done(); });
	test.expect(len);
	
	for (var i = 0; i < 10; i++) {
		var client = new Client(Dataset.clients[i]);
		client.save({}, {
			complete: done,
			success: function(client, response) {
				clients.push(client);
				test.ok(true, 'Saved');
			},
			error: function(client, error) {
				test.ok(false, 'Error saving client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	}
	for (var i = 10; i < 20; i++) {
		var client = new Client();
		client.save(Dataset.clients[i], {
			complete: done,
			success: function(client, response) {
				clients.push(client);
				test.ok(true, 'Saved');
			},
			error: function(client, error) {
				test.ok(false, 'Error saving client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	}
	for (var i = 20; i < 25; i++) {
		var client = new Client(Dataset.clients[i]);
		client.save(null, {
			complete: done,
			success: function(client, response) {
				clients.push(client);
				test.ok(true, 'Saved');
			},
			error: function(client, error) {
				test.ok(false, 'Error saving client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	}
	for (var i = 25; i < 30; i++) {
		var client = new Client();
		client.set(Dataset.clients[i]);
		client.save(null, {
			complete: done,
			success: function(client, response) {
				clients.push(client);
				test.ok(true, 'Saved');
			},
			error: function(client, error) {
				test.ok(false, 'Error saving client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	}
};

exports.update = function(test) {
	var len = clients.length,
		done = _.after(len, function() { test.done(); });
	test.expect(len);

	_.each(clients, function(client) {
		client.save({
			age: client.get('age') + 10
		}, {
			complete: done,
			success: function(client, response) {
				test.ok(true, 'Success');
			},
			error: function(client, error) {
				test.ok(false, 'Error updating client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	});
};

exports.read = function(test) {
	var len = clients.length,
		done = _.after(len, function() { test.done(); });
	test.expect(len);

	_.times(len, function(i) {
		new Client({id: clients[i].id}).fetch({
			complete: done,
			success: function(client, response) {
				var expected = _.find(clients, function(c) { return c.id === client.id; });
				
				var equal = true;
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
			},
			error: function(client, error) {
				test.ok(false, 'Error fetching client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	});
};

exports.destroy = function(test) {
	var len = clients.length,
		done = _.after(len, function() { test.done(); });
	test.expect(len);

	_.each(clients, function(client) {
		client.destroy({
			complete: done,
			success: function(client, response) {
				test.ok(true, 'Success');
			},
			error: function(client, error) {
				test.ok(false, 'Error destroying client.\nClient:\n' + JSON.stringify(client.toJSON()) + '\nError:\n' + JSON.stringify(error));
			}
		});
	});
};