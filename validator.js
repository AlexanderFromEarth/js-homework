const compose = (...funcs) =>
  funcs.length === 0
    ? (x) => x
    : funcs.length === 1
    ? funcs[0]
    : funcs.reduceRight((a, b) => (...args) => a(b(...args)));
const getType = (obj) =>
  Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
const equal = (first, second) =>
  getType(first) === getType(second) &&
  JSON.stringify(first) === JSON.stringify(second);

class Validator {
  _errors = [];

  get Errors() {
    return this._errors;
  }

  //validators
  checkUnknownType = ({ type }) =>
    type && ["string", "number", "boolean", "object", "array"].includes(type);
  checkWrongType = ({ type, obj }) =>
    type && (!this.checkNullable({ obj }) || getType(obj) === type);
  checkNullable = ({ nullable = false, obj }) =>
    getType(nullable) === "boolean" ? obj !== null || nullable : undefined;
  checkAnyOf = ({ anyOf, obj }) =>
    getType(anyOf) === "array"
      ? anyOf.some((type) => this.validate(type, obj).length === 0)
      : undefined;
  checkOneOf = ({ oneOf, obj }) =>
    getType(oneOf) === "array"
      ? oneOf.filter((type) => this.validate(type, obj).length === 0).length ===
        1
      : undefined;
  checkMinBound = ({ minimum, minItems, minLength, minProperties, obj }) =>
    getType(obj) === "number"
      ? minimum && obj >= minimum
      : getType(obj) === "array"
      ? minItems && obj.length >= minItems
      : getType(obj) === "string"
      ? minLength && obj.length >= minLength
      : getType(obj) === "object"
      ? minProperties && Object.keys(obj).length >= minProperties
      : undefined;
  checkMaxBound = ({ maximum, maxItems, maxLength, maxProperties, obj }) =>
    getType(obj) === "number"
      ? maximum && obj <= maximum
      : getType(obj) === "array"
      ? maxItems && obj.length <= maxItems
      : getType(obj) === "string"
      ? maxLength && obj.length <= maxLength
      : getType(obj) === "object"
      ? maxProperties && Object.keys(obj).length <= maxProperties
      : undefined;
  checkStringPattern = ({ pattern, obj }) =>
    getType(obj) === "string" && getType(pattern) === "regexp"
      ? pattern.test(obj)
      : undefined;
  checkStringFormat = ({ format, obj }) =>
    format === "email"
      ? this.checkStringPattern({
          pattern: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
          obj,
        })
      : format === "date"
      ? this.checkStringPattern({ pattern: /^\d{4}([-/])\d{2}\1\d{2}$/, obj })
      : undefined;
  checkAvailableValues = ({ enum: availableValues, obj }) =>
    getType(availableValues) === "array"
      ? availableValues.some((value) => equal(obj, value))
      : undefined;
  checkArrayType = ({ items, obj }) =>
    getType(obj) === "array" &&
    (getType(items) === "array" || getType(items) === "object")
      ? obj.reduce(
          (prev, cur) =>
            prev &&
            (getType(items) === "array"
              ? items.some((item) => this.validate(item, cur).length === 0)
              : this.validate(items, cur).length === 0),
          true
        )
      : undefined;
  checkContains = ({ contains, obj }) =>
    getType(obj) === "array" && contains !== undefined
      ? obj.some((value) => equal(value, contains))
      : undefined;
  checkUnique = ({ uniqueItems, obj }) =>
    getType(obj) === "array" && getType(uniqueItems) === "boolean"
      ? obj.reduce(
          (prev, cur) =>
            !prev.isUnique
              ? prev
              : prev.array.some((value) => equal(value, cur))
              ? { isUnique: false }
              : { isUnique: prev.isUnique, array: [...prev.array, cur] },
          { array: [], isUnique: true }
        ).isUnique
      : undefined;
  checkRequired = ({ required, obj }) =>
    getType(obj) === "object" &&
    (getType(required) === "array" || getType(required) === "string")
      ? getType(required) === "array"
        ? required.reduce((prev, cur) => prev && obj[cur] !== undefined, true)
        : obj[required] !== undefined
      : undefined;
  checkProperties = ({ properties, obj }) =>
    getType(obj) === "object" && getType(properties) == "object"
      ? Object.keys(obj).reduce(
          (prev, cur) =>
            prev &&
            (properties[cur] === undefined ||
              this.validate(properties[cur], obj[cur]).length === 0),
          true
        )
      : undefined;
  checkExtraProperties = ({ additionalProperties, properties, obj }) =>
    getType(obj) === "object" && getType(properties) == "object"
      ? Object.keys(obj).reduce(
          (prev, cur) =>
            prev && (additionalProperties || properties[cur] !== undefined),
          true
        )
      : undefined;

  _makeErrorDecorator = (validator, params, msg) => (errors) =>
    validator(params) === false ? [...errors, msg] : errors;
  getErrorMessages = (type) => ({
    notNullableValue: "Value is null, but nullable false",
    unknownType: "Unknown type",
    wrongType: "Type is incorrect",
    lessThanBound:
      type === "number"
        ? "Value is less than it can be"
        : type === "string"
        ? "Too short string"
        : type === "array"
        ? "Items count less than can be"
        : type === "object"
        ? "Too few properties in object"
        : undefined,
    greaterThanBound:
      type === "number"
        ? "Value is greater than it can be"
        : type === "string"
        ? "Too long string"
        : type === "array"
        ? "Items count more than can be"
        : type === "object"
        ? "Too many properties in object"
        : undefined,
    doesNotMatchPattern: "String does not match pattern",
    notValidFormat: "Format of string is not valid",
    notAvailableValue:
      type === "array"
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
  validate = (schema = {}, obj, errors = []) =>
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
      )(errors))(
      (validator, message) =>
        this._makeErrorDecorator(
          validator,
          { ...schema, anyOf: schema.anyOf || schema.oneOf, obj },
          message
        ),
      this.getErrorMessages(getType(obj))
    );
  isValid = (schema = {}, obj) =>
    (this._errors = this.validate(schema, obj, this._errors)).length === 0;
}
