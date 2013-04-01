/**
 * Backbone.Validator
 *
 * Adds decoupled validator functionality that could be bound to model and view, as well as
 * validated plain hashes with built-in or custom validators
 *
 * @author Maksim Horbachevsky
 */

(function(factory) {
  if (typeof define === 'function' && define.amd) {
    define(['backbone', 'underscore'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('backbone'), require('underscore'));
  } else {
    factory(window.Backbone, window._);
  }
})(function(Backbone, _) {

  'use strict';

  var Validator = Backbone.Validator = {

    version: '0.1.1',

    /**
     * General validation method that gets attributes list and validations config and runs them all
     *
     * @param attrs
     * @param validations
     * @param {Object} [context] - validator execution context
     * @return {*} null if validation passed, errors object if not
     */
    validate: function(attrs, validations, context) {
      var errors = {};
      _.chain(attrs).each(function(attrValue, attrName) {
        var validation = validations[attrName];
        var error = this._validateAll(validation, attrValue, context);

        if (error.length) {
          errors[attrName] = _.uniq(error);
        }
      }, this);

      return _.size(errors) ? errors : null;
    },

    _validateAll: function(validations, attrValue, context) {
      return _.inject(_.flatten([validations || []]), function(errors, validation) {
        _.chain(validation).omit('message').each(function(attrExpectation, validatorName) {
          var validator = this._validators[validatorName];

          if (!validator) {
            throw new Error('Missed validator: ' + validatorName);
          }

          var result = validator.fn.apply(context || this, [attrValue, attrExpectation]);
          if (result !== true) {
            errors.push(validation.message || validator.message || result || 'Invalid');
          }
        }, this);

        return errors;
      }, [], this);
    },

    /**
     * Add validator into collection. Will throw error if try to override existing validator
     *
     *         Backbone.Validator.addValidator('minLength', function(value, expectation) {
     *           return value.length >= expectation;
     *         }, 'Field is too short');
     *
     * @param {String} validatorName - validator name
     * @param {Function} validatorFn - validation function
     * @param {String} [errorMessage] - error message
     */
    add: function(validatorName, validatorFn, errorMessage) {
      this._validators[validatorName] = {
        fn: validatorFn,
        message: errorMessage
      };
    },

    /**
     * Validators storage
     *
     * @private
     * @property _validators
     */
    _validators: {
    }
  };


  /**
   * Collection of methods that will be used to extend standard
   * view and model functionality with validations
   */
  Validator.Extensions = {

    View: {

      /**
       * Bind passed (or internal) model to the view with `validated` event, that fires when model is
       * being validated. Calls `onValidField` and `onInvalidField` callbacks depending on validity of
       * particular attribute
       *
       * @param {Backbone.Model} [model] - model that will be bound to the view
       * @param {Object} options - optional callbacks `onValidField` and `onInvalidField`. If not passed
       * will be retrieved from the view instance or global `Backbone.Validator.ViewCallbacks` object
       */
      bindValidation: function(model, options) {
        model = model || this.model;

        if (!model) {
          throw 'Model is not provided';
        }

        this.listenTo(model, 'validated', function(model, attributes, errors) {
          var callbacks = _.extend({}, Validator.ViewCallbacks, _.pick(this, 'onInvalidField', 'onValidField'), options);
          errors = errors || {};

          _.each(attributes, function(value, name) {
            var attrErrors = errors[name];

            if (attrErrors && attrErrors.length) {
              callbacks.onInvalidField.call(this, name, value, attrErrors, model);
            } else {
              callbacks.onValidField.call(this, name, value, model);
            }
          }, this);
        });
      }
    },

    Model: {

      /**
       * Validation method called by Backbone's internal `#_validate()` or directly from model's instance
       *
       * @param {Object|Array} [attributes] - optional hash/array of attributes to validate
       * @param {Object} [options] - standard Backbone.Model's options list, including `suppress` option. When it's
       * set to true method will store errors into `#errors` property, but return null, so model seemed to be valid
       *
       * @return {null|Object} - null if model is valid, otherwise - collection of errors associated with attributes
       */
      validate: function(attributes, options) {
        var validation = this.validation || {},
          attrs = getAttrsToValidate(attributes, this.attributes, this.validation),
          errors = Validator.validate(attrs, validation, this);

        options = options || {};

        if (!options.silent) {
          _.defer(_.bind(this.triggerValidated, this), attrs, errors);
        }

        return options && options.suppress ? null : errors;
      },

      /**
       * Override Backbone's method to pass properly fetched attributes list
       * @private
       */
      _validate: function(attributes, options) {
        if (!options.validate || !this.validate) return true;
        var attrs = getAttrsToValidate(attributes, this.attributes, this.validation);
        var error = this.validationError = this.validate(attrs, options) || null;

        if (error) {
          this.trigger('invalid', this, error, options || {});
        }

        return !error;
      },

      /**
       * Triggering validation results (invalid/valid) with errors list if nay
       * @param {Object} attributes - validated attributes
       * @param {Object|null} errors
       */
      triggerValidated: function(attributes, errors) {
        var attrs = getAttrsToValidate(attributes, this.attributes, this.validation);
        this.trigger('validated', this, attrs, errors);
        this.trigger('validated:' + (errors ? 'invalid' : 'valid'), this, attrs, errors);
      },

      /**
       * Checks if model is valid
       *
       * @param {Object} [attributes] - optional list of attributes to validate
       * @param {Object} [options] - standard Backbone.Model's options list
       * @return {boolean}
       */
      isValid: function(attributes, options) {
        var attrs = getAttrsToValidate(attributes, this.attributes, this.validation);
        return !this.validate || !this.validate(attrs, options);
      }
    }
  };

  /**
   * Alternative to _.pick() - but also picks undefined/null/false values
   *
   * @param {Object} object - source hash
   * @param {Array} keys - needed keys to pick
   * @return {Object}
   */
  var pick = function(object, keys) {
    return _.inject(_.flatten([keys]), function(memo, key) {
      memo[key] = object[key];
      return memo;
    }, {});
  };

  /**
   * Fetching attributes to validate
   * @return {*}
   */
  var getAttrsToValidate = function(passedAttrs, modelAttrs, validationAttrs) {
    var attrs, all;

    if (_.isArray(passedAttrs) || _.isString(passedAttrs)) {
      attrs = pick(modelAttrs, passedAttrs);
    } else if (!passedAttrs) {
      all = _.extend({}, modelAttrs, validationAttrs || {});
      attrs = pick(modelAttrs, _.keys(all));
    } else {
      attrs = passedAttrs;
    }

    return attrs;
  };

  Validator.ViewCallbacks = {
    onValidField: function(name /*, value, model*/) {
      var input = this.$('input[name="' + name + '"]');

      input.removeClass('error');
      input.next('.error-text').remove();
    },

    onInvalidField: function(name, value, errors /*, model*/) {
      var input = this.$('input[name="' + name + '"]');

      input.next('.error-text').remove();
      input.addClass('error').after('<div class="error-text">' + errors.join(', ') + '</div>');
    }
  };

  /**
   * Built-in validators
   * @type {Array}
   */
  var validators = [
    {
      name: 'required',
      message: 'Is required',
      fn: function(value) {
        return !!value;
      }
    },
    {
      name: 'collection',
      fn: function(collection) {
        var models = collection.models || collection;

        var errors = _.inject(models, function(memo, model, index) {
          var error = model.validate();

          if (error) {
            memo.push([index, error]);
          }

          return memo;
        }, []);

        return errors.length ? errors : true;
      }
    },
    {
      name: 'minLength',
      message: 'Is too short',
      fn: function(value, expectation) {
        return value && value.length >= expectation;
      }
    },
    {
      name: 'maxLength',
      message: 'Is too long',
      fn: function(value, expectation) {
        return value && value.length <= expectation;
      }
    },
    {
      name: 'format',
      message: 'Does not match format',
      fn: function(value, expectation) {
        return !value || !!value.match(Validator.formats[expectation] || expectation);
      }
    },
    {
      name: 'fn',
      fn: function(value, expectation) {
        return expectation.call(this, value);
      }
    }
  ];

  /**
   * Built-in formats
   */
  Validator.formats = {
    digits: /^\d+$/,
    number: /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/,
    email: /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i,
    url: /^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i
  };

  _.each(validators, function(validator) {
    Validator.add(validator.name, validator.fn, validator.message);
  });


  /**
   * Applying validator functionality to backbone's core
   */
  _.extend(Backbone.Model.prototype, Validator.Extensions.Model);
  _.extend(Backbone.View.prototype, Validator.Extensions.View);

  return Validator;
});
