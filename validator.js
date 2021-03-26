const compose = (...funcs) =>
  funcs.length === 0
    ? (x) => x
    : funcs.length === 1
    ? funcs[0]
    : funcs.reduceRight((a, b) => (...args) => a(b(...args)));
const getType = (obj) => obj?.constructor;
const isTypeOfObject = (obj, ...types) =>
  types.some((type) => getType(obj) === type);
const onlyIf = (booleanPredicate, expr) =>
  (booleanPredicate || undefined) && isTypeOfObject(expr, Function)
    ? expr()
    : expr;
const equal = (first, second) =>
  getType(first) === getType(second) &&
  JSON.stringify(first) === JSON.stringify(second);

class Validator {
  _errors = [];
  _availableTypes = [String, Number, Boolean, Object, Array].reduce(
    (prev, cur) => ({ ...prev, [cur.name.toLowerCase()]: cur }),
    {}
  );

  get Errors() {
    return this._errors;
  }

  //validators
  checkNullable = ({ nullable = false, obj }) =>
    onlyIf(isTypeOfObject(nullable, Boolean), () => obj !== null || nullable);
  checkUnknownType = ({ type }) =>
    onlyIf(
      isTypeOfObject(type, String),
      () => this._availableTypes[type] !== undefined
    );
  checkWrongType = ({ type, obj }) =>
    onlyIf(
      isTypeOfObject(type, String),
      () =>
        !this.checkNullable({ obj }) ||
        isTypeOfObject(obj, this._availableTypes[type])
    );
  checkAnyOf = ({ anyOf, obj }) =>
    onlyIf(isTypeOfObject(anyOf, Array), () =>
      anyOf.some((type) => this._isValid(type, obj))
    );
  checkOneOf = ({ oneOf, obj }) =>
    onlyIf(
      isTypeOfObject(oneOf, Array),
      () => oneOf.filter((type) => this._isValid(type, obj)).length <= 1
    );
  checkMinBound = ({ minimum, minItems, minLength, minProperties, obj }) =>
    ({
      Number: onlyIf(isTypeOfObject(minimum, Number), () => obj >= minimum),
      Array: onlyIf(
        isTypeOfObject(minItems, Number),
        () => obj.length >= minItems
      ),
      String: onlyIf(
        isTypeOfObject(minLength, Number),
        () => obj.length >= minLength
      ),
      Object: onlyIf(
        isTypeOfObject(minProperties, Number),
        () => Object.keys(obj).length >= minProperties
      ),
    }[getType(obj)?.name]);
  checkMaxBound = ({ maximum, maxItems, maxLength, maxProperties, obj }) =>
    ({
      Number: onlyIf(isTypeOfObject(maximum, Number), () => obj <= maximum),
      Array: onlyIf(
        isTypeOfObject(maxItems, Number),
        () => obj.length <= maxItems
      ),
      String: onlyIf(
        isTypeOfObject(maxLength, Number),
        () => obj.length <= maxLength
      ),
      Object: onlyIf(
        isTypeOfObject(maxProperties, Number),
        () => Object.keys(obj).length <= maxProperties
      ),
    }[getType(obj)?.name]);
  checkStringPattern = ({ pattern, obj }) =>
    onlyIf(isTypeOfObject(obj, String) && isTypeOfObject(pattern, RegExp), () =>
      pattern.test(obj)
    );
  checkStringFormat = ({ format, obj }) =>
    this.checkStringPattern({
      pattern: {
        email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
        date: /^\d{4}([-/])\d{2}\1\d{2}$/,
      }[format],
      obj,
    });
  checkAvailableValues = ({ enum: availableValues, obj }) =>
    onlyIf(isTypeOfObject(availableValues, Array), () =>
      availableValues.some((value) => equal(obj, value))
    );
  checkArrayType = ({ items, obj }) =>
    onlyIf(
      isTypeOfObject(obj, Array) && isTypeOfObject(items, Array, Object),
      () =>
        obj.reduce(
          (prev, cur) =>
            prev &&
            (isTypeOfObject(items, Array)
              ? items.some((item) => this._isValid(item, cur))
              : this._isValid(items, cur)),
          true
        )
    );
  checkContains = ({ contains, obj }) =>
    onlyIf(isTypeOfObject(obj, Array) && contains !== undefined, () =>
      obj.some((value) => equal(value, contains))
    );
  checkUnique = ({ uniqueItems, obj }) =>
    onlyIf(
      isTypeOfObject(obj, Array) && isTypeOfObject(uniqueItems, Boolean),
      () =>
        obj.reduce(
          (prev, cur) =>
            !prev.isUnique
              ? prev
              : prev.array.some((value) => equal(value, cur))
              ? { isUnique: false }
              : { isUnique: prev.isUnique, array: [...prev.array, cur] },
          { array: [], isUnique: true }
        ).isUnique
    );
  checkRequired = ({ required, obj }) =>
    onlyIf(
      isTypeOfObject(obj, Object) && isTypeOfObject(required, Array, String),
      {
        Array: () =>
          required.reduce((prev, cur) => prev && obj[cur] !== undefined, true),
        String: () => obj[required] !== undefined,
      }[getType(required)?.name]
    );
  checkProperties = ({ properties, obj }) =>
    onlyIf(
      isTypeOfObject(obj, Object) && isTypeOfObject(properties, Object),
      () =>
        Object.keys(obj).reduce(
          (prev, cur) =>
            prev &&
            (properties[cur] === undefined ||
              this._isValid(properties[cur], obj[cur])),
          true
        )
    );
  checkExtraProperties = ({ additionalProperties, properties, obj }) =>
    onlyIf(
      isTypeOfObject(obj, Object) && isTypeOfObject(properties, Object),
      () =>
        Object.keys(obj).reduce(
          (prev, cur) =>
            prev && (additionalProperties || properties[cur] !== undefined),
          true
        )
    );

  _makeErrorDecorator = (validator, params, msg) => (errors) =>
    validator(params) === false ? [...errors, msg] : errors;
  getErrorMessages = (type) => ({
    notNullableValue: "Value is null, but nullable false",
    unknownType: "Unknown type",
    wrongType: "Type is incorrect",
    lessThanBound:
      type === Number
        ? "Value is less than it can be"
        : type === String
        ? "Too short string"
        : type === Array
        ? "Items count less than can be"
        : type === Object
        ? "Too few properties in object"
        : undefined,
    greaterThanBound:
      type === Number
        ? "Value is greater than it can be"
        : type === String
        ? "Too long string"
        : type === Array
        ? "Items count more than can be"
        : type === Object
        ? "Too many properties in object"
        : undefined,
    doesNotMatchPattern: "String does not match pattern",
    notValidFormat: "Format of string is not valid",
    notAvailableValue:
      type === Array
        ? "The enum does not support one of array elements"
        : "The enum does not support value",
    notContainsValue: "Must contain a value, but does not",
    notUniqueElements: "Elements of array not unique",
    undefinedRequiredProperty: "Property required, but value is undefined",
    additionalProperty: "An object cant have additional properties",
    noValidSchemas: "None schemas are valid",
    moreThanOneValidSchema: "More than one shema valid for this data",
    // shema xDDDDDDD
  });
  validate = (schema = {}, obj) =>
    ((makeError, errorMessages) =>
      compose(
        makeError(this.checkNullable, errorMessages.notNullableValue),
        makeError(this.checkUnknownType, errorMessages.unknownType),
        makeError(this.checkWrongType, errorMessages.wrongType),
        makeError(this.checkAnyOf, errorMessages.noValidSchemas),
        makeError(this.checkOneOf, errorMessages.moreThanOneValidSchema),
        makeError(this.checkMinBound, errorMessages.lessThanBound),
        makeError(this.checkMaxBound, errorMessages.greaterThanBound),
        makeError(this.checkStringPattern, errorMessages.doesNotMatchPattern),
        makeError(this.checkStringFormat, errorMessages.notValidFormat),
        makeError(this.checkAvailableValues, errorMessages.notAvailableValue),
        makeError(this.checkArrayType, errorMessages.wrongType),
        makeError(this.checkContains, errorMessages.notContainsValue),
        makeError(this.checkUnique, errorMessages.notUniqueElements),
        makeError(this.checkRequired, errorMessages.undefinedRequiredProperty),
        makeError(this.checkProperties, errorMessages.wrongType),
        makeError(this.checkExtraProperties, errorMessages.additionalProperty)
      )([]))(
      (validator, message) =>
        this._makeErrorDecorator(
          validator,
          { ...schema, anyOf: schema.anyOf || schema.oneOf, obj },
          message
        ),
      this.getErrorMessages(getType(obj))
    );
  _isValid = (schema = {}, obj) => this.validate(schema, obj).length === 0;
  isValid = (schema = {}, obj) =>
    (this._errors = this.validate(schema, obj)).length === 0;
}
