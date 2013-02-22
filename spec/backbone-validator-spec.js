describe('Backbone.Validator', function() {

  var Validator = Backbone.Validator,
    validatorName = 'tempValidator',
    validatorMessage = 'Error message',
    fn, spy, model, view;

  var create = function(Base, classOpts, instanceOpts) {
    var Model = Base.extend(classOpts || {});
    return new Model(instanceOpts || {});
  };

  /**
   * Jasmine's `toEqual` does not check by keys equality and skip key check if value
   * is `undefined`
   *
   * @param {Object} obj1
   * @param {Object} obj2
   */
  var expectToEntirelyEqual = function(obj1, obj2) {
    expect(_.isEqual(obj1, obj2)).toBeTruthy();
  };

  afterEach(function() {
    delete Validator._validators[validatorName];
  });

  Validator.apply();

  describe('#validate', function() {
    it('validates passed attributes', function() {
      spy = spyOn(Validator, '_validateByEntries');

      var email = 'user@example.com';
      var validations = {
        required: true,
        minLength: 3
      };

      Validator.validate({email: email}, {
        email: validations,
        password: { minLength: 6 }
      }, null);

      expect(spy.callCount).toEqual(1);
      expect(spy).toHaveBeenCalledWith(validations, email, null);
    });

    it('validates only passed attributes', function() {
      var errors = Validator.validate({
        email: null
      }, {
        password: {
          required: true
        }
      });

      expect(errors).toBeNull();
    });

    it('passes validator context through all chain', function() {
      var errors = Validator.validate({
        age: 10
      }, {
        age: {
          fn: function(value) {
            return value == this.value + 1;
          }
        }
      }, { value: 9 });

      expect(errors).toBeNull();
    });
  });

  describe('#addValidator', function() {
    it('adds validator to collection', function() {
      Validator.addValidator(validatorName, fn, validatorMessage);
      expect(Validator._validators[validatorName]).toEqual({ fn: fn, message: validatorMessage });
    });

    it('raises error if overriding validator', function() {
      Validator.addValidator(validatorName, fn);
      expect(function() {
        Validator.addValidator(validatorName, fn);
      }).toThrow();
    });

    it('does not raise error if overriding validator allowed by flag', function() {
      Validator.addValidator(validatorName, fn);
      expect(function() {
        Validator.addValidator(validatorName, fn, null, true);
      }).not.toThrow();
    });
  });

  describe('#_validators', function() {
    var expectToFail = function(validatorName, value, expectation, errorMessage) {
      errorMessage = errorMessage || 'error message';

      it('fails with ' + jasmine.pp(value) + ' and returns ' + errorMessage, function() {
        expect(Validator._validateByName(validatorName, value, expectation, errorMessage)).toEqual(errorMessage);
      });
    };

    var expectToPass = function(validatorName, value, expectation) {
      it('passes with ' + jasmine.pp(value), function() {
        expect(Validator._validateByName(validatorName, value, expectation)).toEqual(null);
      });
    };

    describe('required', function() {
      expectToPass('required', 'Hello', true);
      expectToPass('required', true, true);
      expectToPass('required', 1, true);
      expectToFail('required', false, true);
      expectToFail('required', '', true);
      expectToFail('required', null, true);
      expectToFail('required', undefined, true);
    });

    describe('minLength', function() {
      expectToPass('minLength', 'Sam', 3);
      expectToFail('minLength', 'S', 3);
    });

    describe('maxLength', function() {
      expectToPass('maxLength', 'Sam', 3);
      expectToFail('maxLength', 'Samuel', 3);
    });

    describe('fn', function() {
      expectToPass('fn', 'Sam', function(value) {
        return value.length == 3;
      });

      expectToFail('fn', 'Samuel', function(value) {
        return value.length == 3;
      });

      expectToFail('fn', 'Samuel', function(value) {
        return value.length == 3 ? null : 'custom message';
      }, 'custom message');
    });

    describe('format', function() {
      expectToPass('format', 'a_b_c', /^([abc_]*)$/);
      expectToFail('format', 'a_b_c_d', /^([abc_]*)$/);

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

      expectToPass('collection', new Users([{ name: 'Sam' }, { name: 'Tom' }, { name: 'Dan' }]));
      expectToFail('collection', new Users([{ name: 'Sam' }, { name: '' }, { name: '' }]), true, [[1, { name: ['Is required'] }], [2, { name: [ 'Is required'] }]]);
      expectToPass('collection', [new User({ name: 'Sam' }), new User({ name: 'Tom' }), new User({ name: 'Dan' })]);
      expectToFail('collection', [new User({ name: 'Sam' }), new User({ name: '' }), new User({ name: '' })], true, [[1, { name: ['Is required'] }], [2, { name: [ 'Is required'] }]]);
    });
  });

  describe('internals', function() {

    describe('#_validateByEntries', function() {
      beforeEach(function() {
        spy = spyOn(Validator, '_validateByEntry');
      });

      it('accepts object for #_validateByEntry validation', function() {
        var validation = {
          required: true,
          minLength: 3,
          message: 'Invalid field'
        };

        Validator._validateByEntries(validation, 1);
        expect(spy.callCount).toEqual(1);
        expect(spy).toHaveBeenCalledWith(validation, 1, undefined)
      });

      it('accepts array for #_validateByEntry validations', function() {
        var validations = [
          {
            required: true,
            message: 'Invalid field'
          },
          {
            minLength: 3,
            message: 'Invalid field'
          }
        ];

        Validator._validateByEntries(validations, 1, null);
        expect(spy.callCount).toEqual(2);
        expect(spy).toHaveBeenCalledWith(validations[0], 1, null);
        expect(spy).toHaveBeenCalledWith(validations[1], 1, null);
      });
    });

    describe('#_validateByEntry', function() {
      beforeEach(function() {
        spy = spyOn(Validator, '_validateByName');
      });

      it('calls #_validateByName once without custom message', function() {
        Validator._validateByEntry({
          required: false
        }, 1, null);

        expect(spy.callCount).toEqual(1);
        expect(spy).toHaveBeenCalledWith('required', 1, false, undefined, null);
      });

      it('calls #_validateByName once with custom message', function() {
        Validator._validateByEntry({
          required: false,
          message: 'Custom message'
        }, 1, null);

        expect(spy.callCount).toEqual(1);
        expect(spy).toHaveBeenCalledWith('required', 1, false, 'Custom message', null);
      });

      it('calls #_validateByName once per validation entry', function() {
        Validator._validateByEntry({
          required: false,
          minLength: 3,
          maxLength: 5,
          message: 'Custom message'
        });

        expect(spy.callCount).toEqual(3);
      });

      it('returns errors array if any validator fail', function() {
        spy.andReturn('Field is required');

        var errors = Validator._validateByEntry({
          required: false
        });

        expect(errors).toEqual(['Field is required']);
      });

      it('returns errors array with uniq values only', function() {
        spy.andReturn('Field is required');

        var errors = Validator._validateByEntry({
          required: false,
          maxLength: 3
        });

        expect(errors).toEqual(['Field is required']);
      });

      it('returns null if all validation passed', function() {
        spy.andReturn(null);

        var errors = Validator._validateByEntry({
          required: false,
          maxLength: 3
        });

        expect(errors).toEqual(null);
      });
    });

    describe('#_validateByName', function() {
      beforeEach(function() {
        fn = jasmine.createSpy('validator');
        Validator.addValidator(validatorName, fn, validatorMessage);
      });

      describe('when validation passed', function() {
        it('returns null if validation pass', function() {
          fn.andReturn(true);
          expect(Validator._validateByName(validatorName, 1, 2)).toBeNull();
        });

        it('calls validator by name with value and expectation', function() {
          Validator._validateByName(validatorName, 1, 2);
          expect(fn).toHaveBeenCalledWith(1, 2);
        });

        it('raises error when call missed validator', function() {
          expect(function() {
            Validator._validateByName('_missed_validator')
          }).toThrow('Invalid validator name: _missed_validator');
        });
      });

      describe('when validation failed', function() {
        it('returns string from validator as error message', function() {
          fn.andReturn('Validation error');
          expect(Validator._validateByName(validatorName, 1, 2)).toEqual('Validation error');
        });

        it('returns custom error message if provided', function() {
          fn.andReturn(false);
          expect(Validator._validateByName(validatorName, 1, 2, 'Custom message')).toEqual('Custom message');
        });

        it('returns validator message if no custom provided', function() {
          fn.andReturn(false);
          expect(Validator._validateByName(validatorName, 1, 2)).toEqual(validatorMessage);
        });

        it('returns validator result (object) as is if not true', function() {
          fn.andReturn({errors: ['Some error']});
          expect(Validator._validateByName(validatorName, 1, 2)).toEqual({errors: ['Some error']});
        });

        it('returns validator result (array) as is if not true', function() {
          fn.andReturn(['Some error']);
          expect(Validator._validateByName(validatorName, 1, 2)).toEqual(['Some error']);
        });

        it('returns default "Invalid" if no custom or validator message provided', function() {
          delete Validator._validators[validatorName];
          Validator.addValidator(validatorName, fn);
          expect(Validator._validateByName(validatorName, 1, 2)).toEqual('Invalid');
        });
      });
    });
  });

  describe('Backbone.View', function() {
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

      jasmine.Clock.useMock();
    });

    afterEach(function() {
      view.remove();
    });

    describe('#bindValidation', function() {
      it('raises error if model does not exist', function() {
        view.model = null;
        expect(function() {
          view.bindValidation()
        }).toThrow('Model is not provided');
      });

      describe('when validating model', function() {
        var expectBinding = function(setup) {
          setup();

          model.validate({ email: 'user_example_com', name: 'Valid name' });
          jasmine.Clock.tick(50);

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
          jasmine.Clock.tick(50);

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
          jasmine.Clock.tick(50);

          expect(spy).toHaveBeenCalled();
          expect(valid).not.toHaveBeenCalled();
          expect(invalid).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Backbone.Model', function() {

    beforeEach(function() {
      model = create(Backbone.Model, {
        validation: {
          email: {
            format: 'email',
            message: 'Invalid email'
          },

          name: [
            {
              minLength: 4,
              message: 'Should have 4 chars at least'
            },
            {
              fn: function(value) {
                return !value.match(/\d/)
              },
              message: 'Should not include digits'
            }
          ],

          birthday: {
            fn: function(value) {
              return _.isDate(value) && (+value < (+new Date))
            },
            message: 'Should be a valid date in the past'
          }
        }
      });
    });

    describe('#validate', function() {
      var attrs = { email: 'user_example_com', birthday: new Date(2010, 10, 10), name: 'T4' },
        errors = {
          email: ['Invalid email'],
          name: ['Should have 4 chars at least', 'Should not include digits']
        };

      describe('setup', function() {
        it('is called by #save', function() {
          spy = spyOn(model, 'validate').andReturn(true);
          model.save({ email: 'new@example.com' });
          expect(spy).toHaveBeenCalled();
        });

        it('keeps working if `validation` is missed', function() {
          model = create(Backbone.Model, {});
          model.validate();
        });
      });

      describe('with default flags', function() {
        it('runs through all model attributes + validation block keys if nothing passed', function() {
          model.set({ name: 'Sandy' });
          spy = spyOn(Validator, 'validate');
          model.validate();

          expectToEntirelyEqual(spy.argsForCall[0][0], { name: 'Sandy', email: undefined, birthday: undefined });
        });

        it('runs through missed attributes', function() {
          spy = spyOn(Validator, 'validate');
          model.validate({ name: 'Sandy', email: undefined });

          expectToEntirelyEqual(spy.argsForCall[0][0], { name: 'Sandy', email: undefined });
        });

        it('runs through passed attributes (as array)', function() {
          spy = spyOn(Validator, 'validate');
          model.set({ email: 'user@example.com', name: 'Sam' }, { validate: false });
          model.validate(['email', 'name']);

          expect(spy.argsForCall[0][0]).toEqual({ email: 'user@example.com', name: 'Sam' })
        });

        it('runs through passed attribute (as string)', function() {
          spy = spyOn(Validator, 'validate');
          model.set({ email: 'user@example.com', name: 'Sam' }, { validate: false });
          model.validate('email');

          expect(spy.argsForCall[0][0]).toEqual({ email: 'user@example.com' })
        });

        it('runs through passed attributes only', function() {
          spy = spyOn(Validator, 'validate');
          model.validate(attrs);

          expect(spy).toHaveBeenCalledWith(attrs, model.validation, model);
        });

        it('returns errors object', function() {
          expect(model.validate(attrs)).toEqual(errors);
        });

        it('saves errors inside model', function() {
          model.validate(attrs);
          expect(model.errors).toEqual(errors);
        });
      });

      describe('with suppress flag', function() {
        it('saves errors into model', function() {
          model.validate(attrs, { suppress: true });
          expect(model.errors).toEqual(errors);
        });

        it('does not block attributes update (returns null after validation)', function() {
          expect(model.validate(attrs, { suppress: true })).toBeNull();
        });
      });

      describe('events', function() {
        beforeEach(function() {
          jasmine.Clock.useMock();
          spy = jasmine.createSpy('handler');
        });

        it('fires validated event', function() {
          model.on('validated', spy);
          model.validate({ email: 'user@google.com' });
          jasmine.Clock.tick(50);
          expect(spy).toHaveBeenCalled();
        });

        it('fires validated event with `suppress` flag', function() {
          model.on('validated', spy);
          model.validate({ email: 'user@google.com' });
          jasmine.Clock.tick(50);
          expect(spy).toHaveBeenCalled();
        });

        it('fires validated:valid if model valid', function() {
          model.on('validated:valid', spy);
          model.validate({ email: 'user@google.com' });
          jasmine.Clock.tick(50);
          expect(spy).toHaveBeenCalled();
        });

        it('fires validated:invalid if model invalid', function() {
          model.on('validated:invalid', spy);
          model.validate({ email: 'user_google_com' });
          jasmine.Clock.tick(50);
          expect(spy).toHaveBeenCalled();
        });

        it('does not fire events with `silent` flag', function() {
          model.on('validated', spy);
          model.validate({ email: 'user_google_com' }, { silent: true });
          jasmine.Clock.tick(50);
          expect(spy).not.toHaveBeenCalled();
        });
      });
    });

    describe('#isValid', function() {
      it('validates all arguments by default', function() {
        spy = spyOn(model, 'validate');
        model.isValid();
        expect(spy).toHaveBeenCalledWith(null, undefined);
      });

      it('validates only listed attributes if any passed', function() {
        spy = spyOn(model, 'validate');
        model.isValid(['email', 'name'], { silent: true });
        expect(spy).toHaveBeenCalledWith({ email: model.attributes.email, name: model.attributes.name }, { silent: true });
      });
    });
  });
});
