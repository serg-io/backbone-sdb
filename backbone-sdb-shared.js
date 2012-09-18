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
		_schema: function(schema) {
			var idAttrName = this._idAttribute();

			schema || (schema = this.constructor.schema);
			if (_.isFunction(schema)) schema = schema(this);
			schema || (schema = {});

			schema[idAttrName] = schema[idAttrName] ? this._attributeSchema(schema[idAttrName]) : {type: String};
			schema[idAttrName].itemName = true;

			return schema;
		},
		_idAttribute: function() {
			return _.result(this, 'idAttribute');
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
			if (_.isString(attributeSchema)) attributeSchema = this._schema()[attributeSchema];
			if (_.isUndefined(attributeSchema)) return {};

			var array = _.isArray(attributeSchema),
				attrSchema = array ? attributeSchema[0] : attributeSchema;
			if (_.isFunction(attrSchema)) attrSchema = {type: attrSchema};

			attrSchema.array = array || _.result(attrSchema, 'array');
			return attrSchema;
		},
		_processValue: function(value, attrSchema) {
			if (_.isString(value)) {
				var type = attrSchema.type;
				if (type === String) {
					var v = null;
					if (_.result(attrSchema, 'trim') === true) v = value.trim();
					if (_.result(attrSchema, 'lowercase') === true) v = (v || value).toLowerCase();
					else if (_.result(attrSchema, 'uppercase') === true) v = (v || value).toUpperCase();
					if (v) return v;
				} else if (type === Number) {
					var parsed = _.isNumber(_.result(attrSchema, 'precision')) ? parseFloat(value) : parseInt(value);
					if (_.isNumber(parsed) && !_.isNaN(parsed)) return parsed;
				} else if (type === Date && isISODate.test(value)) {
					return new Date(value);
				} else if (type === Boolean) {
					return value === 'true';
				}
			}
		},
		_processJSON: function(attributes) {
			// Converts values, to their correct type, that are kept as strings by JSON.parse() (i.e. Dates)
			// or that are captured as strings from HTML forms
			_.each(attributes, function(value, name) {
				var attrSchema = this._attributeSchema(name);
				if (attrSchema) {
					if (!attrSchema.array) {
						var processed = this._processValue(value, attrSchema);
						if (processed) attributes[name] = processed;
					} else if (_.isArray(value)) {
						for (var i = 0; i < value.length; i++) {
							var processed = this._processValue(value[i], attrSchema);
							if (processed) attributes[name][i] = processed;
						}

						// There can't be 2 attributes with the same name and value in SimpleDB
						if (attributes[name].length > 1) attributes[name] = _.uniq(attributes[name]);
					}
				}
			}, this);
			return attributes;
		},
		set: function(key, value, options) {
			var attrs;
			if (_.isObject(key) || key == null) {
				attrs = key;
				options = value;
			} else {
				attrs = {};
				attrs[key] = value;
			}

			if (options && options.unset) {
				if (key === _.result(this, 'idAttribute')) throw 'The "idAttribute" cannot be unset';

				this._unsetAttributeNames || (this._unsetAttributeNames = []);
				this._unsetAttributeNames.push(key);
				return Backbone.Model.prototype.set.call(this, key, value, options);
			}

			attrs = this._processJSON(attrs);
			return Backbone.Model.prototype.set.call(this, attrs, options);
		},
		validate: function(attributes) {
			var errors = [];
			_.each(attributes, function(value, name) {
				var attrSchema = this._attributeSchema(name);
				if (!_.isEmpty(attrSchema) && !_.isUndefined(value)) {
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
					max = _.result(attrSchema, 'maxLength');
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
			var attrs = Backbone.Model.prototype.toJSON.call(this, options),
				json = {model: attrs};

			if (options) {
				if (!_.isEmpty(options.exclude)) {
					var filtered = {},
						exclude = options.exclude;
					_.isArray(exclude) || (exclude = [exclude]);

					_.each(attrs, function(value, name) {
						if (_.indexOf(exclude, name) === -1) filtered[name] = value;
					});
					json.model = filtered;
				} else if (!_.isEmpty(options.include)) {
					var filtered = {},
						include = options.include;
					_.isArray(include) || (include = [include]);

					_.each(attrs, function(value, name) {
						if (_.indexOf(include, name) !== -1) filtered[name] = value;
					});
					json.model = filtered;
				}

				if (options.includeUnset && !_.isEmpty(this._unsetAttributeNames) && !this.isNew()) { // If the model isNew, there's no need to unset any attributes
					var _unset = [];
					_.each(_.uniq(this._unsetAttributeNames), function(attrName) {
						// If a value was set, after the attribute was unset,
						// the new value will replace the old one therefore there's no need to unset it
						if (_.isUndefined(attrs[attrName])) _unset.push(attrName);
					});
					if (!_.isEmpty(_unset)) json._unsetAttributeNames = _unset;
				}
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
			return this.model.prototype._schema.call(this, this.model.schema);
		},
		_idAttribute: function() {
			return _.result(this.model.prototype, 'idAttribute');
		},
		_attributeSchema: function(attributeSchema) {
			return this.model.prototype._attributeSchema.call(this, attributeSchema);
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