describe('Backbone.Validator', function() {
  'use strict';

  var Validator = Backbone.Validator,
    fn, model, view, spy;

  var create = function(base, classOpts, instanceOpts) {
    var Model = base.extend(classOpts || {});
    return new Model(instanceOpts || {});
  };

  describe('#validators', function() {
    var expectToFail = function(validatorName, value, expectation, errorMessage) {
      var validations = { attr: {} };
      validations.attr[validatorName] = expectation;

      it('fails with ' + jasmine.pp(value) + ' and returns ' + jasmine.pp(errorMessage), function() {
        var errors = Validator.validate({attr: value}, validations);

        if (errorMessage) {
          expect(errors.attr[0]).toEqual(errorMessage);
        } else {
          expect(errors.attr[0]).toBeDefined();
        }
      });
    };

    var expectToPass = function(validatorName, value, expectation) {
      it('passes with ' + jasmine.pp(value), function() {
        var validations = { attr: {} };
        validations.attr[validatorName] = expectation;
        expect(Validator.validate({attr: value}, validations)).toEqual(null);
      });
    };

    describe('add', function() {
      beforeEach(function() {
        spy = jasmine.createSpy('validator');
        Validator.add('custom', spy);
      });

      it('passes expected value and all attributes being validated', function() {
        var attributes = { field_1: 1, field_2: 2 };

        model = create(Backbone.Model, {
          validation: {
            field_1: {
              custom: 10
            }
          }
        });

        model.set(attributes, {validate: true});
        expect(spy).toHaveBeenCalledWith(1, 10, attributes);
      });
    });

    describe('required', function() {
      expectToPass('required', 'Hello', true);
      expectToPass('required', true, true);
      expectToPass('required', undefined, false);
      expectToPass('required', 1, true);
      expectToFail('required', false, true);
      expectToFail('required', '', true);
      expectToFail('required', null, true);
      expectToFail('required', undefined, true);
    });

    describe('blank', function() {
      expectToPass('blank', 'Hello', false);
      expectToPass('blank', '   Hello', false);
      expectToPass('blank', '   Hello   ', false);
      expectToPass('blank', [1], false);
      expectToPass('blank', {a: 1}, false);
      expectToFail('blank', '', false);
      expectToFail('blank', '   ', false);
      expectToFail('blank', [], false);
      expectToFail('blank', {}, false);
    });

    describe('minLength', function() {
      expectToPass('minLength', 'Sam', 3);
      expectToPass('minLength', undefined, 3);
      expectToPass('minLength', '', 3);
      expectToFail('minLength', 'S', 3);
    });

    describe('maxLength', function() {
      expectToPass('maxLength', 'Sam', 3);
      expectToPass('maxLength', undefined, 3);
      expectToPass('maxLength', '', 3);
      expectToFail('maxLength', 'Samuel', 3);
    });

    describe('fn', function() {
      expectToPass('fn', 'Sam', function(value) {
        return value.length === 3;
      });

      expectToFail('fn', 'Samuel', function(value) {
        return value.length === 3;
      });

      expectToFail('fn', 'Samuel', function(value) {
        return value.length === 3 ? null : 'custom message';
      }, 'custom message');
    });

    describe('format', function() {
      expectToPass('format', 'a_b_c', /^([abc_]*)$/);
      expectToFail('format', 'a_b_c_d', /^([abc_]*)$/);

      expectToPass('format', '', 'email');
      expectToPass('format', 'user@example.com', 'email');
      expectToFail('format', 'user_example.com', 'email');

      expectToPass('format', 'http://example.com', 'url');
      expectToFail('format', 'http_example_com', 'url');

      expectToPass('format', '1234', 'digits');
      expectToFail('format', '1234a', 'digits');

      expectToPass('format', '123.789', 'number');
      expectToFail('format', '123.789a', 'number');
    });

    describe('collection', function() {
      var User = Backbone.Model.extend({
        validation: {
          name: {
            required: true
          }
        }
      });

      var Users = Backbone.Collection.extend({ model: User });

      expectToPass('collection', new Users([
        { name: 'Sam' },
        { name: 'Tom' },
        { name: 'Dan' }
      ]));

      expectToPass('collection', new Users([
        { name: 'Sam' },
        { name: '' },
        { name: '' }
      ]), false);

      expectToPass('collection', [
        { name: 'Sam' },
        { name: 'Tom' },
        { name: 'Dan' }
      ], function(models) {
        return new Users(models);
      });

      expectToFail('collection', [
        { name: 'Sam' },
        { name: '' },
        { name: '' }
      ], function(models) {
        return new Users(models);
      }, [
        [1, { name: ['Is required'] }],
        [2, { name: ['Is required'] }]
      ]);

      expectToPass('collection', undefined, true);
      expectToPass('collection', [], true);

      expectToFail('collection', new Users([
        { name: 'Sam' },
        { name: '' },
        { name: '' }
      ]), true, [
        [1, { name: ['Is required'] }],
        [2, { name: ['Is required'] }]
      ]);

    });

    describe('model', function() {
      var User = Backbone.Model.extend({
        validation: {
          name: {
            required: true
          }
        }
      });

      expectToPass('model', new User({ name: 'Sam' }));
      expectToPass('model', new User({ name: '' }), false);
      expectToPass('model', undefined);
      expectToPass('model', null);
      expectToFail('model', new User({ name: '' }), true, { name: [ 'Is required' ] });
      expectToPass('model', { name: 'Sam' }, function(attrs) {
        return new User(attrs);
      });
    });
  });

  describe('#validate', function() {
    var attrs, validation;

    beforeEach(function() {
      attrs = { name: 'a' };
      validation = {
        name: {
          minLength: 3,
          message: function(attr, value, expectation, validator) {
            return 'Inline: ' + _.toArray(arguments).join(', ');
          }
        }
      };
    });

    it('allows error to be a function', function() {
      var errors = Validator.validate(attrs, validation);
      expect(errors).toEqual({ name: ['Inline: name, a, 3, minLength'] });
    });

    it('uses global error generator if specified', function() {
      validation.name.message = null;
      spyOn(Validator, 'createMessage').and.callFake(function() {
        return 'Global: ' + _.initial(arguments).join(', ');
      });

      var errors = Validator.validate(attrs, validation);
      expect(errors).toEqual({ name: ['Global: name, a, 3, minLength'] });
    });

    it('formats error message', function() {
      validation.name.message = 'inline';
      spyOn(Validator, 'formatMessage').and.callFake(function() {
        return 'Formatted: ' + _.initial(arguments).join(', ');
      });

      var errors = Validator.validate(attrs, validation);
      expect(errors).toEqual({ name: ['Formatted: inline, name, a, 3, minLength'] });
    });
  });

  describe('Model', function() {
    beforeEach(function() {
      model = create(Backbone.Model, {
        validation: {
          field_1: {
            required: true,
            message: '#1 required'
          },

          field_2: {
            required: true,
            format: 'email',
            message: '#2 format'
          },

          field_3: [
            {
              required: true,
              message: '#3 required'
            },
            {
              message: '#3 from fn',
              fn: function(value) {
                return !!value ? true : '#3 overridden';
              }
            },
            {
              message: '#3 from config',
              fn: function(value) {
                return !!value;
              }
            }
          ],

          field_5: [
            {
              required: false,
              message: '#5 not required'
            },
            {
              fn: function(value) {
                return !!value;
              },
              message: '#5 from config'
            }
          ]

        }
      });

      spyOn(model, 'sync');
    });

    describe('via #save', function() {
      it('validates passed attributes', function() {
        model.save({field_1: null});
        expect(model.validationError).toEqual({
          field_1: ['#1 required']
        });
      });

      it('validates passed attributes even if no validation for it', function() {
        model.save({field_8: 1, field_9: 1});
        expect(model.validationError).toBeNull();
      });

      it('validates entire model', function() {
        model.save();
        expect(model.validationError).toEqual({
          field_1: ['#1 required'],
          field_2: ['#2 format'],
          field_3: ['#3 required', '#3 from fn', '#3 from config']
        });
      });

      it('passes validation with proper values', function() {
        model.save({field_1: 1, field_2: 'user@example.com', field_3: 1 });
        expect(model.validationError).toBeNull();
      });

      it('allows `validation` to be a function', function() {
        model.validation = function() {
          return {
            field_1: {
              required: true,
              message: '#1 required'
            }
          };
        };

        model.save();
        expect(model.validationError).toEqual({ field_1: ['#1 required'] });
      });
    });

    describe('via #isValid', function() {
      it('validates passed attributes', function() {
        expect(model.isValid('field_1')).toBeFalsy();
      });

      it('validates passed attributes even if no validation for it', function() {
        expect(model.isValid()).toBeFalsy();
      });

      it('validates entire model', function() {
        expect(model.isValid()).toBeFalsy();
      });

      it('passes validation with proper values', function() {
        model.set({field_1: 1, field_2: 'user@example.com', field_3: 1 });
        expect(model.isValid()).toBeTruthy();
      });
    });

    describe('via #set', function() {
      it('validates passed attributes', function() {
        model.set({field_1: null}, {validate: true});
        expect(model.validationError).toEqual({
          field_1: ['#1 required']
        });
      });

      it('validates passed attributes even if no validation for it', function() {
        model.set({field_8: 1, field_9: 1}, {validate: true});
        expect(model.validationError).toBeNull();
      });

      it('passes validation with proper values', function() {
        model.set({field_1: 1, field_2: 'user@example.com', field_3: 1 }, {validate: true});
        expect(model.validationError).toBeNull();
      });
    });

    describe('trigger validation', function() {
      var valid, invalid;

      beforeEach(function() {
        valid = jasmine.createSpy('valid');
        invalid = jasmine.createSpy('invalid');
        model.on('validated:valid', valid);
        model.on('validated:invalid', invalid);
      });

      it('filters empty error values', function() {
        model.triggerValidated(null, { email: [], name: ['Too short'] });
        expect(invalid.calls.argsFor(0)[2]).toEqual({ name: ['Too short'] });
      });

      it('fires validated:valid error if all errors are empty', function() {
        model.triggerValidated(null, { email: [], name: [] });
        expect(valid).toHaveBeenCalled();
        expect(invalid).not.toHaveBeenCalled();
      });
    });

    describe('#processErrors', function() {
      it('used from options', function() {
        var spy = jasmine.createSpy('processErrors').and.callFake(function(errors) {
            return errors;
          }),
          errors = model.validate(null, { processErrors: spy });

        expect(spy).toHaveBeenCalledWith(errors);
      });

      it('used from global ModelCallbacks if not defined in options', function() {
        var spy = spyOn(Validator.ModelCallbacks, 'processErrors').and.callThrough(),
          errors = model.validate(null);

        expect(spy).toHaveBeenCalledWith(errors);
      });
    });
  });

  describe('View', function() {
    var valid, invalid;

    beforeEach(function() {
      valid = jasmine.createSpy('valid');
      invalid = jasmine.createSpy('invalid');

      model = create(Backbone.Model, {
        validation: {
          email: {
            format: 'email',
            message: 'Invalid email'
          },

          name: {
            minLength: 4
          }
        }
      });

      view = create(Backbone.View, {
        model: model
      });

      jasmine.clock().install();
    });

    afterEach(function() {
      jasmine.clock().uninstall();
      view.remove();
    });

    it('raises error if model does not exist', function() {
      view.model = null;
      expect(function() {
        view.bindValidation();
      }).toThrow('Model is not provided');
    });

    describe('when validating model', function() {
      var expectBinding = function(setup) {
        setup();

        model.validate({ email: 'user_example_com', name: 'Valid name' });
        jasmine.clock().tick(50);

        expect(valid).toHaveBeenCalledWith('name', 'Valid name', model);
        expect(invalid).toHaveBeenCalledWith('email', 'user_example_com', ['Invalid email'], model);
      };

      it('runs callbacks from options if specified', function() {
        expectBinding(function() {
          view.bindValidation(model, {
            onValidField: valid,
            onInvalidField: invalid
          });
        });
      });

      it('runs callbacks from view instance if specified', function() {
        expectBinding(function() {
          view.bindValidation(model);
          _.extend(view, {
            onValidField: valid,
            onInvalidField: invalid
          });
        });
      });

      it('runs callbacks fallback from Backbone.Validator.ViewCallbacks', function() {
        expectBinding(function() {
          view.bindValidation(model);
          Validator.ViewCallbacks = {
            onValidField: valid,
            onInvalidField: invalid
          };
        });
      });
    });

    describe('when view removed', function() {
      it('unbinds `validated` events', function() {
        view.bindValidation(model, {
          onValidField: valid,
          onInvalidField: invalid

        });

        view.remove();
        model.validate();
        jasmine.clock().tick(50);

        expect(valid).not.toHaveBeenCalled();
        expect(invalid).not.toHaveBeenCalled();
      });

      it('unbinds only `validated` event', function() {
        spy = jasmine.createSpy('spy');
        model.on('validated', spy);
        view.bindValidation(model, {
          onValidField: valid,
          onInvalidField: invalid
        });
        view.remove();

        model.validate({ email: 'user@example.com' });
        jasmine.clock().tick(50);

        expect(spy).toHaveBeenCalled();
        expect(valid).not.toHaveBeenCalled();
        expect(invalid).not.toHaveBeenCalled();
      });
    });
  });
});
