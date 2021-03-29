const id = (x) => x;
const compose = (...funcs) =>
  funcs.length === 0
    ? id
    : funcs.length === 1
    ? funcs[0]
    : funcs.reduceRight((a, b) => (...args) => a(b(...args)));
const getType = (obj) => obj?.constructor;
const isTypeOfObject = (obj, ...types) =>
  types.some((type) => getType(obj) === type);
const match = (...variants) => (obj) =>
  variants.find(({ predicate }) => predicate(obj))?.body(obj);
const onlyIf = (booleanPredicate, expr) =>
  (booleanPredicate || undefined) &&
  (isTypeOfObject(expr, Function) ? expr() : expr);
const equal = (first, second) =>
  getType(first) === getType(second) &&
  JSON.stringify(first) === JSON.stringify(second);
const countNMT = (array, predicate, count) =>
  array.reduce((prev, cur) => (prev > count ? prev : prev + predicate(cur)), 0);

class Validator {
  _errors = [];

  get Errors() {
    return this._errors;
  }

  //validators
  checkNullable = ({ nullable = false, obj }) =>
    onlyIf(isTypeOfObject(nullable, Boolean), () => obj !== null || nullable);
  checkUnknownType = ({ type }) =>
    onlyIf(
      isTypeOfObject(type, String),
      () =>
        [String, Number, Boolean, Object, Array].reduce(
          (prev, cur) => ({ ...prev, [cur.name.toLowerCase()]: cur }),
          {}
        )[type] !== undefined
    );
  checkWrongType = ({ type, obj }) =>
    onlyIf(
      isTypeOfObject(type, String),
      () =>
        !this.checkNullable({ obj }) || getType(obj).name.toLowerCase() === type
    );
  checkMinBound = ({ minimum, minItems, minLength, minProperties, obj }) =>
    ({
      [Number]: onlyIf(isTypeOfObject(minimum, Number), () => obj >= minimum),
      [Array]: onlyIf(
        isTypeOfObject(minItems, Number),
        () => obj.length >= minItems
      ),
      [String]: onlyIf(
        isTypeOfObject(minLength, Number),
        () => obj.length >= minLength
      ),
      [Object]: onlyIf(
        isTypeOfObject(minProperties, Number),
        () => Object.keys(obj).length >= minProperties
      ),
    }[getType(obj)]);
  checkMaxBound = ({ maximum, maxItems, maxLength, maxProperties, obj }) =>
    ({
      [Number]: onlyIf(isTypeOfObject(maximum, Number), () => obj <= maximum),
      [Array]: onlyIf(
        isTypeOfObject(maxItems, Number),
        () => obj.length <= maxItems
      ),
      [String]: onlyIf(
        isTypeOfObject(maxLength, Number),
        () => obj.length <= maxLength
      ),
      [Object]: onlyIf(
        isTypeOfObject(maxProperties, Number),
        () => Object.keys(obj).length <= maxProperties
      ),
    }[getType(obj)]);
  checkStringPattern = ({ pattern, obj }) =>
    onlyIf(isTypeOfObject(obj, String) && isTypeOfObject(pattern, RegExp), () =>
      pattern.test(obj)
    );
  checkStringFormat = ({ format, obj }) =>
    this.checkStringPattern({
      pattern: {
        email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
        date: /^\d{4}([-/])(0[1-9]|1[0-2])\1(0[1-9]|[12][0-9]|3[01])$/,
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
              ? items.some((item) => this.validate(item, cur).isValid)
              : this.validate(items, cur).isValid),
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
              this.validate(properties[cur], obj[cur]).isValid),
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

  getErrorMessages = (type) => ({
    notNullableValue: "Value is null, but nullable false",
    unknownType: "Unknown type",
    wrongType: "Type is incorrect",
    lessThanBound: {
      [Number]: "Value is less than it can be",
      [String]: "Too short string",
      [Array]: "Items count less than can be",
      [Object]: "Too few properties in object",
    }[type],
    greaterThanBound: {
      [Number]: "Value is greater than it can be",
      [String]: "Too long string",
      [Array]: "Items count more than can be",
      [Object]: "Too many properties in object",
    }[type],
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
    ((errors) => ({ errors, isValid: errors?.length === 0 }))(
      onlyIf(isTypeOfObject(schema, Object), () =>
        match(
          {
            predicate: () =>
              this.checkArrayType({
                items: { type: "object" },
                obj: schema.oneOf,
              }),
            body: () =>
              ({
                0: [this.getErrorMessages().noValidSchemas],
                1: [],
                2: [this.getErrorMessages().moreThanOneValidSchema],
              }[
                countNMT(
                  schema.oneOf,
                  (type) => this.validate(type, obj).isValid,
                  1
                )
              ]),
          },
          {
            predicate: () =>
              this.checkArrayType({
                items: { type: "object" },
                obj: schema.anyOf,
              }),
            body: () =>
              ({
                0: [this.getErrorMessages().noValidSchemas],
                1: [],
              }[
                countNMT(
                  schema.anyOf,
                  (type) => this.validate(type, obj).isValid,
                  0
                )
              ]),
          },
          {
            predicate: () => true,
            body: () =>
              ((makeError, messages) =>
                compose(
                  ...[
                    [this.checkNullable, messages.notNullableValue],
                    [this.checkUnknownType, messages.unknownType],
                    [this.checkWrongType, messages.wrongType],
                    [this.checkMinBound, messages.lessThanBound],
                    [this.checkMaxBound, messages.greaterThanBound],
                    [this.checkStringPattern, messages.doesNotMatchPattern],
                    [this.checkStringFormat, messages.notValidFormat],
                    [this.checkAvailableValues, messages.notAvailableValue],
                    [this.checkArrayType, messages.wrongType],
                    [this.checkContains, messages.notContainsValue],
                    [this.checkUnique, messages.notUniqueElements],
                    [this.checkRequired, messages.undefinedRequiredProperty],
                    [this.checkProperties, messages.wrongType],
                    [this.checkExtraProperties, messages.additionalProperty],
                  ].map(makeError)
                )([]))(
                ([validator, message]) => (errors) =>
                  validator({ ...schema, obj }) === false
                    ? [...errors, message]
                    : errors,
                this.getErrorMessages(getType(obj))
              ),
          }
        )()
      )
    );
  isValid = (schema = {}, obj) =>
    (this._errors = this.validate(schema, obj).errors).length === 0;
}
