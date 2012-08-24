/**
backbone-sdb 0.0.1 - (c) 2012 Sergio Alcantara
Server side (Node.js) `Backbone.sync()` SimpleDB implementation

@module SimpleDB
@author Sergio Alcantara
 */

var aws = require('aws2js'),
	_ = require('underscore'),
	uuid = require('node-uuid'),
	Backbone = require('./backbone-sdb-shared');

var sdb = null;

(Backbone.SDB.setup = function(accessKeyID, secretAccessKey, awsRegion) {
	var accessKey = accessKeyID || process.env.AWS_ACCESS_KEY_ID,
		secretKey = secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
		region = awsRegion || process.env.AWS_REGION || 'us-east-1';
	
	if (accessKey && secretKey) sdb = aws.load('sdb', accessKey, secretKey);
	if (sdb && region) sdb.setRegion(region);
})();

function DBUtils() {
	this.processQueryExpression = function(query, schema) {
		var where = '';
		_.each(query, function(expression, name) {
			if (/^\$not$/i.test(name)) {
				var notWhere = this.processQueryExpression(expression, schema);
				if (notWhere.length > 0) {
					where += ' AND (NOT(' + notWhere + '))';
				}
			} else if (/^\$/.test(name)) { // $and, $or, $intersection
				var joinStr = name.substr(1).toUpperCase();

				// SimpleDB doesn't like 'intersection' in upper case
				if (/^intersection$/i.test(joinStr)) joinStr = joinStr.toLowerCase();

				if (_.isArray(expression)) { // expression must be an array of objects
					where += ' AND (' + _.chain(expression).map(function(arrExpr) {
						if (_.isEmpty(arrExpr)) return null;
						
						var n = _.keys(arrExpr)[0]; // Only one filter per arrExpr, any others are ignored
						return this.processExpression(n, arrExpr[n], schema);
					}, this).filter(function(predicate) {
						return predicate !== null;
					}, this).value().join(' ' + joinStr + ' ') + ')';
				}
			} else {
				var expr = this.processExpression(name, expression, schema);
				if (expr !== null) where += ' AND ' + expr;
			}
		}, this);
		
		if (where.length > 0) where = where.substr(5);

		// If query has only 1 key, and that key is $and, $or, $not, or $intersection
		// the where expresion would be surrounded by unnecessary parenthesis
		var keys = _.keys(query);
		if (keys.length == 1 && /^\$(and|or|not|intersection)$/i.test(keys[0]) && where.length >= 2) {
			where = where.substr(1, where.length - 2);
		}
		return where;
	};
	
	this.processExpression = function(name, expr, schema) {
		var attrSchema = Backbone.SDB.Model.prototype._attributeSchema.call(this, schema[name]),
			qn = this.quoteName(name, attrSchema);

		if (_.isObject(expr) && _.keys(expr).length > 1) {
			return '(' + _.chain(expr).map(function(v, n) {
				var singleExpr = {};
				singleExpr[n] = v;
				return this.processExpression(name, singleExpr, schema);
			}, this).filter(function(predicate) {
				return predicate !== null;
			}, this).value().join(' AND ') + ')';
		} else if (expr.$every) {
			return this.processSingleExpression('EVERY(' + qn + ')', expr.$every, attrSchema);
		} else if (expr.$not) {
			return this.processSingleExpression('NOT ' + qn, expr.$not, attrSchema);
		}
		return this.processSingleExpression(qn, expr, attrSchema);
	};
	
	var operators = {
		$eq: '=',
		$ne: '!=',
		$lt: '<',
		$lte: '<=',
		$gt: '>',
		$gte: '>=',
		$like: 'LIKE',
		$notlike: 'NOT LIKE'
	};

	this.processSingleExpression = function(quotedName, expr, attrSchema) {
		if (_.isUndefined(expr)) return quotedName + ' IS NULL';
		else if(_.isObject(expr) && !_.isDate(expr)) {
			var operator, opKey = _.keys(expr)[0];
			if (operator = operators[opKey]) {
				var value = expr[opKey];
				// If value is array, build a seperate predicate for each value in the array and concatenate them with an AND.
				// i.e. quotedName = '`description`' and expr = {$like: ['%luxury%', '%blue%', '%car%']} it would return
				// (`description` LIKE "%luxury%" AND `description` LIKE "%blue%" AND `description` LIKE "%car%")
				if (_.isArray(value)) {
					var exprStr = '(' + _.chain(value).map(function(val) {
						return this.predicate(quotedName, operator, val, attrSchema);
					}, this).filter(function(_exprStr) {
						return _exprStr !== null;
					}, this).value().join(' AND ') + ')';
					return exprStr === '()' ? null : exprStr;
				}
				return this.predicate(quotedName, operator, value, attrSchema);
			} else if (_.isArray(expr.$in) && !_.isEmpty(expr.$in)) {
				return quotedName + ' IN (' + _.map(expr.$in, function(val) {
					return this.encodeAndQuote(val, attrSchema);
				}, this).join(',') + ')';
			} else if (_.isArray(expr.$between) && expr.$between.length >= 2) {
				var b = expr.$between;
				return quotedName + ' BETWEEN ' + this.encodeAndQuote(b[0], attrSchema) + ' AND ' + this.encodeAndQuote(b[1], attrSchema);
			} else if (_.isBoolean(expr.$isnull)) {
				operator = expr.$isnull === false ? operators.$ne : operators.$eq;
				return this.predicate(quotedName, operator, null, attrSchema);
			} else if (_.isBoolean(expr.$isundefined)) {
				return quotedName + ' IS ' + (expr.$isundefined ? 'NULL' : 'NOT NULL');
			}
		}
		return this.predicate(quotedName, operators.$eq, expr, attrSchema);
	};
	
	this.predicate = function(quotedName, operator, value, attrSchema) {
		return quotedName + ' ' + operator + ' ' + this.encodeAndQuote(value, attrSchema);
	};
	
	this.encodeAndQuote = function(value, attrSchema) {
		return this.quoteValue(this.encode(value, attrSchema));
	};
	
	this.quoteValue = function(value) {
		return '"' + value.replace(/"/g, '""') + '"';
	};
	
	this.quoteName = function(name, attrSchema) {
		if (name === 'id') return 'itemName()';
		return '`' + name.replace(/`/g, '``') + '`';
	};
	
	this.zeroPad = function(value, length, precision) {
		var str = Math.floor(value).toFixed();
		for (var i = length - str.length; i > 0; i--) str = '0' + str;
		if (precision) str += '.' + Math.floor(value * Math.pow(10, precision)).toFixed().substr(precision * -1);
		return str;
	};
	
	this.encode = function(value, attrSchema) {
		if (value === null) return 'null';

		attrSchema || (attrSchema = {});
		var type = attrSchema.type;
		if (type === Number) {
			var min = _.result(attrSchema, 'min'), // Offset (default: 0)
				max = _.result(attrSchema, 'max'),
				len = _.result(attrSchema, 'length'),
				precision = _.result(attrSchema, 'precision');
			min = _.isNumber(min) ? Math.abs(precision ? min : Math.floor(min)) : 0;

			// If attrSchema has no valid 'length', use min and max to determine the maximum number of digits (default: 10)
			if (!_.isNumber(len)) len = _.isNumber(max) ? Math.floor(max + min).toFixed().length : 10;
			return this.zeroPad(value + min, len, precision);
		} else if (type === Boolean && _.isBoolean(value)) {
			return value.toString();
		} else if (type === Date && _.isDate(value)) {
			return value.toISOString();
		} else if (type === String && _.isString(value)) {
			return value;
		}
		return JSON.stringify(value);
	};
	
	this.decode = function(value, attrSchema) {
		if (value === 'null') return null;

		attrSchema || (attrSchema = {});
		var type = attrSchema.type;
		if (type === Number) {
			// TODO: Javascript might add extra precision floating digits when substracting the offset (min).
			// Consider: 0.55 - 1 = -0.44999999999999996
			var min = _.result(attrSchema, 'min'), // Offset (default: 0)
				precision = _.result(attrSchema, 'precision');
			min = _.isNumber(min) ? Math.abs(precision ? min : Math.floor(min)) : 0;
			return new Number(value).valueOf() - min;
		} else if (type === Boolean) {
			return value === 'true';
		} else if (type === Date) {
			return new Date(value);
		} else if (type === String) {
			return value;
		}

		// If the value was and empty string when it was saved, aws2js.sdb would return an empty object as the value:
		// {Name: 'attributename', Value: {}}
		return _.isObject(value) && _.isEmpty(value) ? '' : JSON.parse(value);
	};
	
	this.putItem = function(model, options) {
		var changed = {};
		var params = {
			ItemName: model.id || (changed.id = _.result(model, 'customId') || uuid()),
			DomainName: model._domainName()
		};
		_.extend(params, options.sdb);
		
		var schema = model._schema();
		_.each(schema, function(attributeSchema, name) {
			var attrSchema = Backbone.SDB.Model.prototype._attributeSchema.call(this, attributeSchema),
				update = _.result(attrSchema, 'onUpdate');
			if (!_.isUndefined(update)) changed[name] = update;
		}, this);
		
		var i = 0;
		if (!_.isEmpty(model._unsetAttributeNames) && !model.isNew()) {
			var delParams = _.clone(params);
			_.each(model._unsetAttributeNames, function(name) {
				delParams['Attribute.' + i++ + '.Name'] = name;
			});
			sdb.request('DeleteAttributes', delParams, function(error, response) {});
		}
		
		i = 0;
		var attributes = _.extend({}, model.toJSON().model, changed);
		delete attributes.id;
		_.each(attributes, function(value, name) {
			if (schema[name]) {
				var attrSchema = model._attributeSchema(schema[name]);
				if (attrSchema.array && _.isArray(value)) {
					params['Attribute.' + i + '.Replace'] = true; // Replace only the first attribute of an array
					if (_.isEmpty(value)) {
						params['Attribute.' + i + '.Name'] = name;
						params['Attribute.' + i + '.Value'] = '[]';
						i++;
					} else if (value.length === 1 && value[0] === null) {
						params['Attribute.' + i + '.Name'] = name;
						params['Attribute.' + i + '.Value'] = '[null]';
						i++;
					} else {
						_.each(value, function(val) {
							params['Attribute.' + i + '.Name'] = name;
							params['Attribute.' + i + '.Value'] = this.encode(val, attrSchema);
							i++;
						}, this);
					}
				} else {
					params['Attribute.' + i + '.Replace'] = true;
					params['Attribute.' + i + '.Name'] = name;
					params['Attribute.' + i + '.Value'] = this.encode(value, attrSchema);
					i++;
				}
			} else if (!_.isUndefined(value)) {
				params['Attribute.' + i + '.Replace'] = true;
				params['Attribute.' + i + '.Name'] = name;
				params['Attribute.' + i + '.Value'] = this.encode(value);
				i++;
			}
		}, this);

		// If a 'close' event was fired on the SimpleDB HTTP request object, the callback might be called twice,
		// therefore, the callback is forced to run only once.
		// A 'close' can be fired after 'end': http://nodejs.org/docs/latest/api/http.html#event_end_
		sdb.request('PutAttributes', params, _.once(function(error, response) {
			// A 'close' event triggers an error, but a 'close' event doesn't mean that the request failed.
			// Checking the HTTP response code.
			if (error && error.code !== 200 && error.code !== 204) options.error(model, {code: 'DBError', sdb: error});
			else options.success({model: changed, sdb: response});
			
			if (_.isFunction(options.complete)) options.complete(model, {sdb: response});
		}));
	};
	
	this.deleteItem = function(model, options) {
		var params = {
			ItemName: model.id,
			DomainName: model._domainName()
		};
		_.extend(params, options.sdb);
		
		// If a 'close' event was fired on the SimpleDB HTTP request, the callback might be called twice,
		// therefore, the callback is forced to run only once.
		// A 'close' can be fired after 'end': http://nodejs.org/docs/latest/api/http.html#event_end_
		sdb.request('DeleteAttributes', params, _.once(function(error, response) {
			// A 'close' event triggers an error, but a 'close' event doesn't mean that the request failed.
			// Checking the HTTP response code.
			if (error && error.code !== 200 && error.code !== 204) options.error(model, {code: 'DBError', sdb: error});
			else options.success({sdb: response});
			
			if (_.isFunction(options.complete)) options.complete(model, {sdb: response});
		}));
	};

	this.parseAttributes = function(attributes, schema) {
		var attrs = {};
		_.each(attributes, function(attr) {
			var name = attr.Name,
				value = attr.Value;

			if (schema[name]) {
				var attrSchema = Backbone.SDB.Model.prototype._attributeSchema.call(this, schema[name]);
				if ((value === '[]' || value === '[null]') && attrSchema.array && _.isUndefined(attrs[name])) {
					attrs[name] = value === '[]' ? [] : [null];
					return;
				}

				var v = this.decode(value, attrSchema);
				if (!attrSchema.array) {
					attrs[name] = v;
				} else if (v === null && _.isUndefined(attrs[name])) {
					// The attribute, which is supposed to be an array, is null, or
					// the first parsed array element is null and the array contains more elements
					attrs[name] = null;
				} else {
					_.isArray(attrs[name]) || (attrs[name] = !_.isUndefined(attrs[name]) ? [attrs[name]] : []);
					attrs[name].push(v);
				}
			} else {
				attrs[name] = this.decode(value);
			}
		}, this);
		return attrs;
	};
	
	this.getItem = function(model, options) {
		var params = {
			ItemName: model.id,
			DomainName: model._domainName()
		};
		_.extend(params, options.sdb);
		console.log('Fetching: ', params);
		
		// If a 'close' event was fired on the SimpleDB HTTP request, the callback might be called twice,
		// therefore, the callback is forced to run only once.
		// A 'close' can be fired after 'end': http://nodejs.org/docs/latest/api/http.html#event_end_
		sdb.request('GetAttributes', params, _.once(_.bind(function(error, response) {
			// A 'close' event triggers an error, but a 'close' event doesn't mean that the request failed.
			// Checking the HTTP response code.
			if (error && error.code !== 200 && error.code !== 204) options.error(model, {code: 'DBError', sdb: error});
			else {
				var attrs = null;
				try {
					attrs = response.GetAttributesResult.Attribute;
					if (_.isEmpty(attrs)) throw 'Not found';
					_.isArray(attrs) || (attrs = [attrs]);
				} catch (e) {
					attrs = null;
					options.error(model, {code: 'NotFound', sdb: response});
				}

				if (attrs) options.success({model: this.parseAttributes(attrs, model._schema()), sdb: response});
			}
			
			if (_.isFunction(options.complete)) options.complete(model, {sdb: response});
		}, this)));
	};

	this.select = function(instance, options) { // instance can be a collection or a model
		var params = _.extend({SelectExpression: options.query}, options.sdb);
		
		// If a 'close' event was fired on the SimpleDB HTTP request, the callback might be called twice,
		// therefore, the callback is forced to run only once.
		// A 'close' can be fired after 'end': http://nodejs.org/docs/latest/api/http.html#event_end_
		sdb.request('Select', params, _.once(_.bind(function(error, response) {
			// A 'close' event triggers an error, but a 'close' event doesn't mean that the request failed.
			// Checking the HTTP response code.
			if (error && error.code !== 200 && error.code !== 204) {
				if (_.isFunction(options.error)) options.error(instance, {code: 'DBError', sdb: error});
			} else if (_.isFunction(options.success)) {
				var nextToken = null;
				try {
					nextToken = response.SelectResult.NextToken || null;
				} catch (e) {}
				
				var items = [];
				try {
					items = response.SelectResult.Item || [];
					if (!_.isArray(items)) items = [items];
				} catch (e) {}

				var collection = _.map(items, function(item) {
					var attrs = item.Attribute;
					_.isArray(attrs) || (attrs = [attrs]);
					attrs = this.parseAttributes(attrs, instance._schema());
					return {model: _.extend({id: item.Name}, attrs)};
				}, this);

				if (instance instanceof Backbone.SDB.Collection) {
					var json = {
						collection: collection,
						sdb: response
					};
					if (nextToken) json._nextToken = nextToken;
					options.success(json);
				} else if (!_.isEmpty(collection)) {
					var json = _.first(collection);
					json.sdb = response;

					options.success(json);
				} else if (_.isFunction(options.error)) {
					options.error(instance, {code: 'NotFound', sdb: response});
				}
			}
			
			if (_.isFunction(options.complete)) options.complete(instance, {sdb: response});
		}, this)));
	};
	
	function sync(method, instance, options) {
		if (method === 'create' || method === 'update') {
			this.putItem(instance, options);
		} else if (method === 'read') {
			if (instance instanceof Backbone.SDB.Model && instance.id) this.getItem(instance, options);
			else this.select(instance, options);
		} else {
			this.deleteItem(instance, options);
		}
	}
	
	Backbone.sync = _.bind(sync, this);
}
var dbUtils = new DBUtils();

var instanceMethods = {
	_domainName: function() {
		var isColl = this instanceof Backbone.SDB.Collection,
			domainName = isColl ? this.model.domainName : this.constructor.domainName;
		if (domainName) return _.isFunction(domainName) ? domainName(this) : domainName;

		domainName = _.result(this, isColl ? 'url' : 'urlRoot').replace(/^\//, '');
		return domainName.charAt(0).toUpperCase() + domainName.substring(1);
	}
};

var classMethods = {
	count: function(query, options) {
		options = _.extend({returnQueryStr: true}, options);
		var selectExpr = this.query(query, options),
			params = _.extend({SelectExpression: 'SELECT COUNT(*) ' + selectExpr.substr(9)}, options.sdb);
		
		// If a 'close' event was fired on the SimpleDB HTTP request, the callback might be called twice,
		// therefore, the callback is forced to run only once.
		// A 'close' can be fired after 'end': http://nodejs.org/docs/latest/api/http.html#event_end_
		sdb.request('Select', params, _.once(_.bind(function(error, response) {
			// A 'close' event triggers an error, but a 'close' event doesn't mean that the request failed.
			// Checking the HTTP response code.
			var count = null;
			if (error && error.code !== 200 && error.code !== 204) {
				if (_.isFunction(options.error)) options.error({code: 'DBError', sdb: error});
			} else {
				try {
					count = parseInt(response.SelectResult.Item.Attribute.Value);
					if (!_.isNumber(count) || _.isNaN(count)) throw new TypeError('Invalid "count" value');
				} catch (e) {
					count = null;
					if (_.isFunction(options.error)) options.error({code: 'DBError', sdb: response});
				}
				if (count && _.isFunction(options.success)) options.success(count, {sdb: response});
			}
			
			if (_.isFunction(options.complete)) options.complete(count, {sdb: response});
		}, this)));
	},
	query: function(query, options) {
		query || (query = {});
		options || (options = {});
		var instance = new this(), // Can be Model or Collection
			schema = instance._schema(),
			domainName = dbUtils.quoteName(instance._domainName());

		var sort = '',
			orderBy = options.orderBy;
		if (orderBy) {
			if (!query[orderBy]) query[orderBy] = {$isundefined: false}; // The 'orderBy' attribute must be part of the query expression

			var attrSchema = Backbone.SDB.Model.prototype._attributeSchema.call(instance, schema[orderBy]);
			sort = ' ORDER BY ' + dbUtils.quoteName(orderBy, attrSchema);
			if (/^(ASC|DESC)$/i.test(options.order)) sort += ' ' + options.order.toUpperCase();
		}

		var where = dbUtils.processQueryExpression(query, schema);
		if (!_.isEmpty(where)) where = ' WHERE ' + where;

		var limit = '';
		if (instance instanceof Backbone.SDB.Model) limit = ' LIMIT 1';
		else if (_.isNumber(options.limit)) limit = ' LIMIT ' + options.limit;

		var queryExpression = 'SELECT * FROM ' + domainName + where + sort + limit;
		if (options.returnQueryStr === true) return queryExpression;

		return instance.fetch(_.extend({query: queryExpression}, options));
	}
};

var modelParse = Backbone.SDB.Model.prototype.parse;

Backbone.SDB.Model = Backbone.SDB.Model.extend(_.extend({
	parse: function(obj) {
		if (!_.isEmpty(obj._unsetAttributeNames)) this._unsetAttributeNames = this._unsetAttributeNames.concat(obj._unsetAttributeNames);
		return modelParse.call(this, obj);
	}
}, instanceMethods), classMethods);
Backbone.SDB.Collection = Backbone.SDB.Collection.extend(instanceMethods, classMethods);

module.exports = Backbone;