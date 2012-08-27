backbone-sdb
============

Server side Backbone.js sync implementation for SimpleDB.

Installation
------------

Execute the following command at the root of your project:

	npm install backbone-sdb

`Backbone.SDB.setup(accessKeyID, secretAccessKey, awsRegion)`
-------------------------------------------------------------

Sets up the AWS access key id, secret access key, and region to use. If one, or more, of these are not provided, it attempts to get them from the following environment variables:

* `AWS_ACCESS_KEY_ID`
* `AWS_SECRET_ACCESS_KEY`
* `AWS_REGION` (The default region is: `'us-east-1'`)

You don't have to call the `setup()` method if these values are in your environment settings, `backbone-sdb` automatically picks them up when you call `require('backbone-sdb')`.

`Backbone.SDB.Model`
--------------------

### `extend(properties, classProperties)`

The `extend()` method is the same as the original [`Backbone.Model.extend()`](http://documentcloud.github.com/backbone/#Model-extend) method with the following exceptions/additions:

#### `properties`

* `idAttribute`: Specifies the name of the attribute that is the `itemName`. The default value is `id`. If the `id` hasn't been set when calling `save()`, an UUID is generated and set as the `id`.
* `urlRoot`: If no `classProperties.domainName` is given, the value of `urlRoot` is used to determine the name of the domain. First, the `'/'` at the beginning, if any, is removed, then the first character is switched to upper case. For instance: if `urlRoot` is `'/users'`, the domain name is `'Users'`.

#### `classProperties`

* `domainName`: The name of the SimpleDB domain to use.
* `schema`: An object specifying the schema, and rules, for attributes within this model. Even though SimpleDB is a schema-less data store, setting an schema provides the following advantages:
	* Numbers: It automatically encodes numbers when storing them and decodes them when reading them back from SimpleDB following [Amazon's recommendations](http://docs.amazonwebservices.com/AmazonSimpleDB/latest/DeveloperGuide/NumericalData.html) for storing numeric data in SimpleDB.
	* Dates: It encodes dates into ISO 8601 strings when storing them, and decodes them back to `Date` instances when reading them from SimpleDB.
	* Queries: Values are automatically encoded when making queries. This makes a very easy and seamless way of querying data in SimpleDB without the need of encoding the values in the `SelectExpression`.
	* Validation: The `validate()` method is use to verify that attributes follow the specified schema. Failed validations trigger an `error` event.
	* Additional attributes: You can still add attributes and store them in SimpleDB even if they're not specified in the schema. These attributes are encoded using `JSON.stringify()` when storing them and decoded using `JSON.parse()` when fetching them from SimpleDB.

### Schema

Each attribute in the schema must be in the following format:

	attributeName: attributeSchema|[attributeSchema]

`[attributeSchema]` means that the attribute is an array (a multi-value attribute in SimpleDB). `attributeName` is the name of the attribute and `attributeSchema` follows these rules:

	attributeSchema: type|details
	type: String|Boolean|Number|Date
	details: {type: String|Boolean|Number|Date [,default: defaultValue][,onUpdate: updateValue][, enum: [values]][, nullable: true|false]}
	// Additional details can be set, depending on the type

* `default`: Specifies the attribute's default value.
* `onUpdate`: Every time the `save()` method is called, this attributes is set to this update value.
* `enum`: An array that specifies the attribute's allowable values.
* `nullable`: Specifies if the attribute can be `null`. Default is `true`.

Important note: `null` values are stored in SimpleDB as a string with the word null in it: `'null'`

`schema` can also be a function that returns an object. This is useful if you want `default` and/or `onUpdate` to be dynamic values. For instance:

	schema: function() {
		return {
			createdOn: {type: Date, default: new Date()},
			lastModified: {type: Date, default: new Date(), onUpdate: new Date()}
		};
	}

#### `String` Attributes

You can specify the following `attributeSchema` details for `String` attributes:

* `minLength`: Specifies the minimum length of the string. Must be an integer and can't be less than 0 or greater than 1024. Default is 0.
* `maxLength`: Specifies the maximum length of the string. Must be an integer and can't be less than 0 or greater than 1024. Default is 1024.
* `trim`: It trims the string when the attribute is set.
* `lowercase`: It converts the string to lower case when the attribute is set.
* `uppercase`: It converts the string to upper case when the attribute is set.
* `match`: A regular expression. The string must pass the regular expression test.

#### `Number` Attributes

You can specify the following `attributeSchema` details for `Number` attributes:

* `min`: Specifies the minimum allowable value (inclusive) for this number. Default is 0.
* `max`: Specifies the maximum allowable value (inclusive) for this number. Default is 9999999999.
* `precision`: Specifies the number of precision digits. In other words, the number of digits to the right of the decimal point. If this is not set, or if it's 0, this attribute is stored as an integer.
* `length`: Specifies the maximum number of digits to the left of the decimal point, or the maximum number of digits if the number is an integer (if no `precision` is given). If `length` is not set but `max` is set, `length` is the number of digits in the result from this operation: `Math.floor(max + Math.abs(min))`. Default is 10 (if `max` is not set).

#### `Date` Attributes

You can specify the following `attributeSchema` details for `Date` attributes:

* `min`: Specifies the minimum allowable date (inclusive) for this attribute.
* `max`: Specifies the maximum allowable date (inclusive) for this attribute.

#### `Boolean` Attributes

`Boolean` attributes have not additional details that can be set in the `attributeSchema`. `Boolean` attributes can be `true`, `false`, or `null` if `nullable` is not set to `false`.

#### Array Attributes

You can specify the following `attributeSchema` details if you surround put the `attributeSchema` inside an array, like so `attributeName: [attributeSchema]`, which means that the attribute is an array (a multi-value attribute in SimpleDB).

* `minSize`: Specifies the minimum number of elements for the array. Must be an integer no less than 0 but no greater than 256. Default is 0.
* `maxSize`: Specifies the maximum number of elements for the array. Must be an integer no less than 0 but no greater than 256. Default is 256.

`Backbone.SDB.Collection`
--------------------

### `extend(properties, [classProperties])`

The `extend()` method is the same as the original [`Backbone.Collection.extend()`](http://documentcloud.github.com/backbone/#Collection-extend) method with exception:

* `properties.url`: If the collection's model doesn't have a `domainName` the value of `url` is used to determine the name of the domain. First, the `'/'` at the beginning, if any, is removed, then the first character is switched to upper case. For instance: if `url` is `'/users'`, the domain name is `'Users'`.

`save`, `destroy`, `fetch`, and their callbacks
-----------------------------------------------

The following applies to both `Backbone.SDB.Model` and `Backbone.SDB.Collection`

### `options.sdb`

When calling `save(attributes, options)`, `destroy(options)`, or `fetch(options)` the SimpleDB request is automatically generated. You can extend this request using the `options.sdb`. For instance, you can set the SimpleDB `ConsistentRead` option:

	model.fetch({
		sdb: {
			ConsistentRead: true
		}
		// Other options here
	});

### SimpleDB Response

The SimpleDB response is provided to the `success(model, response)`, `error(model, response)`, and `complete(model, response)` callbacks in `response.sdb`.

### `options.context`

Similar to the `context` setting in [jQuery.ajax](http://api.jquery.com/jQuery.ajax/#jQuery-ajax-settings), setting the `options.context` when calling `save(attributes, options)`, `destroy(options)`, or `fetch(options)`, will make all callbacks to be called within the given context. In other words, the value of `this`, within the callbacks, will be the given `options.context`.

#### `complete(model, response)`

The `options.complete` callback, if specified, is called after either `options.success` or `options.error` has been called.

`query(query, options)`
-----------------------

The `query` method is a static method available in the constructor functions for your models and collections and it is used to send `Select` requests to SimpleDB in which the `SelectExpression` is automatically generated from the given `query` and `options` arguments. It also automatically encodes any `Number` and `Date` attributes if they're part of the model's `schema`.

`Collection.query()` creates an instance of the collection, with all the returned models that satisfy the `query` argument, and would provide that instance to the callbacks set in `options`. If the query did not return any results, an empty collection instance (a collection instance with no models) is provided to the callbacks.

`Model.query()` adds `LIMIT 1` to the `SelectExpression`. It creates an instance of the model using the attributes returned from the request, and provides that model to the callbacks set in the `options` argument.

### The `query` argument

The `query` argument is an object from which the `SelectExpression` is built.

#### Operators

The following is a list of available operators and their meaning.

* `$eq` translates into `=`: Equals operator.
* `$ne` translates into `!=`: Not equals operator.
* `$lt` translates into `<`: Less than operator.
* `$lte` translates into `<=`: Less than or equal operator.
* `$gt` translates into `>`: Greater than operator.
* `$gte` translates into `>=`: Greater than or equal operator.
* `$like` translates into `LIKE`: Like operator.
* `$notlike` translates into `NOT LIKE`: Not like operator
* `$in` translates into `IN (<values>)`: In operator. This must be an array.
* `$between` translates into `BETWEEN <value> AND <value>`: Between operator. This must be an array containing only two values.
* `$not` translates into `NOT (<expression>)`: Not operator. This must be an expression object.
* `$isnull`: If `true`, it translates into `` `name` = "null"``. If false, it translates into `` `name` != "null"``. This is because `null` values are store in SimpleDB as `'null'`.
* `$isundefined`: If `true` it translates into `` `name` IS NULL``. If `false` it translates into `` `name` IS NOT NULL``.
* `$intersection`: The `intersection` operator. Must be an array of 2 expression objects.
* `$and`: Joins an array of 2 or more expression objects with the `AND` operator.
* `$or`: Joins an array of 2 or more expression objects with the `OR` operator.

The $eq operator is used by default if no operator is specified in an expression.

### The `options` argument

You can set the following options when calling the `query` method.

* `orderBy`: The name of the attribute to use to sort the results.
* `order`: The order of the result, when an `orderBy` value is given. Can be `'ASC'` or `'DESC'`.
* `limit`: Limit the number of results.
* `sdb`: Extend the request by passing SimpleDB options (for instance, `ConsistentRead`).
* `success`, `error`, and `complete` callbacks. When calling `Model.query` these callbacks take `(model, response)` as arguments. When calling `Collection.query()` these callbacks take `(collection, response)` as arguments.

`Collection.count(query, options)`
----------------------------------

The `count` method available as a static method in collection constructor functions can be use to send `SELECT COUNT(*)...` queries to SimpleDB. It works exactly the same as the `query` method with the exception that the callback functions take `(countResult, response)` as arguments, where `countResult` is an integer representing the number of models that satisfy the given `query` expression object.

Examples
--------

	var Backbone = require('backbone-sdb');

	var Client = Backbone.SDB.Model.extend({
		urlRoot: '/clients', // Domain name: 'Clients'
		idAttribute: 'clientId' // clientId is the itemName
	}, {
		schema: function() {
			return {
				// The idAttribute is a `String` by default, but it could be Number or Date
				clientId:		String, // Optional
				firstName:		String,
				lastName:		String,
				middleInitial:	{type: String, maxLength: 1},
				email:			{
					type: String,
					trim: true,
					lowercase: true,
					match: /^[_A-Za-z0-9-]+(\.[_A-Za-z0-9-]+)*@[A-Za-z0-9]+(\.[A-Za-z0-9]+)*(\.[A-Za-z]{2,})$/
				},
				age:			{type: Number, min: 18, length: 3},
				favoriteColors:	[String],
				latitude:		{type: Number, min: -90, max: 90, precision: 6},
				longitude:		{type: Number, min: -180, max: 180, precision: 6},
				newsletter:		Boolean,
				createdOn:		{type: Date, default: new Date()}
			}
		}
	});
	var Clients = Backbone.SDB.Collection.extend({
		url: '/clients',
		model: Client
	});

	new Client({
		firstName: 'John',
		lastName: 'Doe',
		middleInitial: 'H',
		email: 'john@doe.com',
		age: 34,
		favoriteColors: ['blue', 'yellow', 'brown', 'blue', 'pink'], // Only one 'blue' is stored in SimpleDB
		latitude: -50.061028,
		longitude: 85.945632,
		newsletter: true
		// createdOn is set to new Date(), the default value
	}).save({}, {
		success: function(client, response) {
			// All attributes are stored in SimpleDB in their encoded form

			// An UUID string is automatically set as the clientId, which is the model's id
			console.log(client.id); 
			console.log(client.toJSON());

			new Client({clientId: client.id}).fetch({
				sdb: {
					ConsistentRead: true
				},
				success: function(fetchedClient, response) {
					// All attributes are decoded when reading them from SimpleDB
					console.log(fetchedClient.toJSON());
				}
			});
		}
	});

	// Get all clients that have 'Jane' as their firstName and 'Smith' as their lastName
	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `firstName` = "Jane" AND `lastName` = "Smith"
	Clients.query({
		firstName: 'Jane', // This is the same as `firstName: {$eq: 'Jane'}`
		lastName: 'Smith'
	}, {
		sdb: {
			ConsistentRead: true
		},
		success: function(clients, response) {
			console.log(clients.toJSON());
		}
		// Other options
	});

	// This is the same as the previous query
	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `firstName` = "Jane" AND `lastName` = "Smith"
	Clients.query({
		$and: [
			{firstName: {$eq: 'Jane'}},
			{lastName: {$eq: 'Smith'}}
		]
	}, {/* options */});

	
	// Generated SelectExpression: SELECT * FROM `Clients` WHERE NOT (`firstName` = "Jane" AND `lastName` = "Smith")
	Clients.query({
		$not: {
			firstName: 'Jane',
			lastName: 'Smith'
		}
	}, {/* options */});

	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `favoriteColors` = "blue" intersection `favoriteColors` = "brown"
	Clients.query({
		$intersection: [
			{favoriteColors: 'blue'},
			{favoriteColors: 'brown'}
		]
	}, {/* options */});

	// An offset, specified in the schema as `min`, is applied to numbers. Numbers are also zero padded.
	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `age` BETWEEN "043" AND "048"
	Clients.query({
		age: {$between: [25, 30]}
	}, {/* options */});

	// $between is inclusive
	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `latitude` BETWEEN "040.000000" AND "041.000000" AND `longitude` BETWEEN "265.000000" AND "266.000000"
	Clients.query({
		latitude: {$between: [-50, -49]},
		longitude: {$between: [85, 86]}
	}, {/* options */});

	// Exclusive query.
	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `latitude` > "040.000000" AND `latitude` < "041.000000" AND `longitude` > "265.000000" AND `longitude` < "266.000000"
	Clients.query({
		$and: [
			{latitude: {$gt: -50}},
			{latitude: {$lt: -49}},
			{longitude: {$gt: 85}},
			{longitude: {$lt: 86}}
		]
	}, {/* options */});

	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `age` IN ("058","068","078")
	Clients.query({
		age: {$in: [40, 50, 60]}
	}, {/* options */});

	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `middleInitial` IS NULL
	Clients.query({
		middleInitial: {$isundefined: true}
	}, {/* options */});

	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `middleInitial` != "null"
	Clients.query({
		middleInitial: {$isnull: false}
	}, {/* options */});

	// Retrieve clients where favoriteColors is ONLY 'blue' or 'yellow' or BOTH
	// Generated SelectExpression: SELECT * FROM `Clients` WHERE EVERY(`favoriteColors`) IN ("blue","yellow")
	Clients.query({
		favoriteColors: {$every: {$in: ['blue', 'yellow']}}
	}, {/* options */});

	// Count the number of clients that are subscribed to the newsletter
	// Generated SelectExpression: SELECT COUNT(*) FROM `Clients` WHERE `newsletter` = "true"
	Clients.count({
		newsletter: true
	}, {
		sdb: {
			ConsistentRead: true
		},
		success: function(count, response) {
			console.log(count + ' clients subscribed to the newsletter');
		}
	});

	// Count all clients created in the month of January 2012, local time (PDT)
	// Inclusive query
	// Generated SelectExpression: SELECT COUNT(*) FROM `Clients` WHERE `createdOn` BETWEEN "2012-01-01T08:00:00.000Z" AND "2012-02-01T07:59:59.999Z"
	Clients.count({
		createdOn: {$between: [new Date(2012, 0, 1), new Date(2012, 0, 31, 23, 59, 59, 999)]}
	}, {
		success: function(count, response) {
			console.log(count + ' clients were created in the month of January 2012');
		}
	});

	// Count all clients created in the month of January 2012 (UTC)
	// Generated SelectExpression: SELECT COUNT(*) FROM `Clients` WHERE `createdOn` >= "2012-01-01T00:00:00.000Z" AND `createdOn` < "2012-02-01T00:00:00.000Z"
	Clients.count({
		$and: [
			{createdOn: {$gte: new Date('01 January 2012 UTC')}},
			{createdOn: {$lt: new Date('01 February 2012 UTC')}}
		]
	}, {/* options */});

	// Query for only 1 client with 'foo@bar.com' as his email address
	// It automatically adds 'LIMIT 1', since it's the query method of the model constructor (not the collection)
	// Generated SelectExpression: SELECT * FROM `Clients` WHERE `email` = "foo@bar.com" LIMIT 1
	Client.query({
		email: 'foo@bar.com'
	}, {
		success: function(client, response) {
			console.log(client.toJSON());
		},
		error: function(client, error) {
			// If client wasn't found, error.code = 'NotFound'
			console.error(error);
		}
	});