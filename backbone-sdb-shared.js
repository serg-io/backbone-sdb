/**
This module is inteded to contain functionality that can be shared between client and server side

@module SimpleDB
@submodule SimpleDB-Shared
@author Sergio Alcantara
 */

if (typeof require === 'function') {
	var _ = _ || require('underscore');
	var Backbone = Backbone || require('backbone');
}

function bindContext(options){
	if (options && options.context) {
		if (_.isFunction(options.error)) options.error = _.bind(options.error, options.context);
		if (_.isFunction(options.success)) options.success = _.bind(options.success, options.context);
		if (_.isFunction(options.complete)) options.complete = _.bind(options.complete, options.context);
	}
	return options;
}

var isISODate = /^\d{4}(-\d{2}){2}T\d{2}(:\d{2}){2}\.\d{3}Z$/;

Backbone.SDB = {
	isISODate: isISODate,

	Model: Backbone.Model.extend({
		_unsetAttributeNames: [],
		_schema: function() {
			var schema = this.constructor.schema;
			return _.isFunction(schema) ? schema(this) : schema;
		},
		save: function(attributes, options) {
			return Backbone.Model.prototype.save.call(this, attributes, bindContext(options));
		},
		destroy: function(options) {
			return Backbone.Model.prototype.destroy.call(this, bindContext(options));
		},
		fetch: function(options) {
			return Backbone.Model.prototype.fetch.call(this, bindContext(options));
		},
		parse: function(obj) {
			return obj.model;
		},
		_attributeSchema: function(attributeSchema) {
			if (_.isUndefined(attributeSchema)) return {};

			var array = _.isArray(attributeSchema),
				attrSchema = array ? attributeSchema[0] : attributeSchema;
			if (_.isFunction(attrSchema)) attrSchema = {type: attrSchema};

			attrSchema.array = array || _.result(attrSchema, 'array');
			return attrSchema;
		},
		_processJSON: function(attributes) {
			// Converts values, to their correct type, that are kept as strings by JSON.parse() (i.e. Dates)
			// or that are captured as strings from HTML forms
			_.each(this._schema(), function(attributeSchema, name) {
				// TODO: Run same logic in arrays?
				var attrSchema = this._attributeSchema(attributeSchema),
					value = attributes[name],
					type = attrSchema.type;
				if (_.isString(value)) {
					if (type === String) {
						if (_.result(attrSchema, 'trim') === true) attributes[name] = value.trim();
						if (_.result(attrSchema, 'lowercase') === true) attributes[name] = value.toLowerCase();
						else if (_.result(attrSchema, 'uppercase') === true) attributes[name] = value.toUpperCase();
					} else {
						if (type === Date && isISODate.test(value)) {
							attributes[name] = new Date(value);
						} else if (type === Number) {
							var parsed = _.isNumber(_.result(attrSchema, 'precision')) ? parseFloat(value) : parseInt(value);
							if (_.isNumber(parsed) && !_.isNaN(parsed)) attributes[name] = parsed;
						} else if (type === Boolean) {
							attributes[name] = value === 'true';
						}
					}
				} else if (attrSchema.array && _.isArray(value) && !_.isEmpty(value)) {
					// There can't be 2 attributes with the same name and value in SimpleDB
					attributes[name] = _.uniq(value);
				}
			}, this);
			return attributes;
		},
		set: function(key, value, options) {
			if (options && options.unset) {
				this._unsetAttributeNames.push(key);
				return Backbone.Model.prototype.set.apply(this, arguments);
			}

			var attrs;
			if (_.isObject(key) || key == null) {
				attrs = key;
				options = value;
			} else {
				attrs = {};
				attrs[key] = value;
			}

			return Backbone.Model.prototype.set.call(this, this._processJSON(attrs), options);
		},
		validate: function(attributes) {
			var schema = this._schema(),
				errors = [];

			_.each(attributes, function(value, name) {
				if (schema[name] && !_.isUndefined(value)) {
					var attrSchema = this._attributeSchema(schema[name]);

					if (value === null) {
						var nullable = _.result(attrSchema, 'nullable') !== false;
						if (!nullable) {
							errors.push({
								attributeName: name,
								code: 'CannotBeNull'
							});
						}
					} else if (attrSchema.array) {
						if (!_.isArray(value)) {
							errors.push({
								attributeName: name,
								code: 'MustBeArray'
							});
						} else {
							var size = _.size(value),
								min = _.result(attrSchema, 'minSize') || 0,
								max = _.result(attrSchema, 'maxSize') || 256;
							if (min < 0) min = 0;
							if (max > 256) max = 256;

							if (size < min || size > max) {
								errors.push({
									attributeName: name,
									code: 'SizeOutOfRange'
								});
							} else {
								_.each(value, function(val) {
									var code = this._validateValue(val, attrSchema);
									if (code) {
										errors.push({
											attributeName: name,
											code: code,
											errorValue: val
										});
									}
								}, this);
							}
						}
					} else {
						var code = this._validateValue(value, attrSchema);
						if (code) {
							errors.push({
								attributeName: name,
								code: code
							});
						}
					}
				}
			}, this);
			if (!_.isEmpty(errors)) return {code: 'ValidationError', errors: errors};
		},
		_validateValue: function(value, attrSchema) {
			if (value === null) { // Re-check for nulls in non-nullable attributes. Only happens with null values within arrays.
				var nullable = _.result(attrSchema, 'nullable') !== false;
				if (!nullable) return 'CannotBeNull';
				return;
			}

			var enums = _.result(attrSchema, 'enum');
			if (_.isArray(enums) && !_.include(enums, value)) return 'ValueNotInEnum';

			var type = attrSchema.type;
			if (type === String) {
				if (!_.isString(value)) return 'IncorrectType';

				var min = _.result(attrSchema, 'minLength'),
					max = _.result(attrSchema, 'maxLenght');
				if (!_.isNumber(min) || _.isNaN(min) || min < 0) min = 0;
				if (!_.isNumber(max) || _.isNaN(max) || max > 1024) max = 1024;

				if (value.length < min || value.length > max) return 'LengthOutOfRange';

				var match = _.result(attrSchema, 'match');
				if (_.isRegExp(match) && !match.test(value)) return 'DoesNotMatchRegExp';
			} else if (type === Number) {
				if (!_.isNumber(value) || _.isNaN(value)) return 'IncorrectType';

				var min = _.result(attrSchema, 'min'),
					max = _.result(attrSchema, 'max');
				if (!_.isNumber(min) || _.isNaN(min)) min = 0;
				if (!_.isNumber(max) || _.isNaN(max)) max = 9999999999;

				if (value < min || value > max) return 'OutOfRange';
			} else if (type === Boolean) {
				if (!_.isBoolean(value)) return 'IncorrectType';
			} else if (type === Date) {
				if (!_.isDate(value)) return 'IncorrectType';

				var min = _.result(attrSchema, 'min'),
					max = _.result(attrSchema, 'max');
				if ((_.isDate(min) && value < min) || (_.isDate(max) && value > max)) return 'OutOfRange';
			} else {
				return 'InvalidType';
			}
		},
		toJSON: function(options) {
			var json = {
				model: Backbone.Model.prototype.toJSON.call(this, options)
			};
			
			if (!_.isEmpty(this._unsetAttributeNames) && !this.isNew()) { // If the model isNew, there's no need to unset any attributes
				var _unset = [];
				_.each(_.uniq(this._unsetAttributeNames), function(attrName) {
					// If a value was set, after the attribute was unset, the new value will replace the old one therefore there's no need to unset it
					if (_.isUndefined(json.model[attrName])) _unset.push(attrName);
				});
				if (!_.isEmpty(_unset)) json._unsetAttributeNames = _unset;
			}
			return json;
		},
		defaults: function() {
			var defaults = {};
			_.each(this._schema(), function(attributeSchema, attrName) {
				var attrSchema = this._attributeSchema(attributeSchema),
					def = _.result(attrSchema, 'default');
				if (!_.isUndefined(def)) defaults[attrName] = def;
			}, this);
			return defaults;
		}
	}),

	Collection: Backbone.Collection.extend({
		_schema: function() {
			var schema = this.model.schema;
			return _.isFunction(schema) ? schema(this) : schema;
		},
		fetch: function(options) {
			return Backbone.Collection.prototype.fetch.call(this, bindContext(options));
		},
		parse: function(obj) {
			return obj.collection;
		},
		toJSON: function(options) {
			return {
				collection: Backbone.Collection.prototype.toJSON.call(this, options)
			};
		}
	})
};

if (typeof module !== 'undefined') module.exports = Backbone;