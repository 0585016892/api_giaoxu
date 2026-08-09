const parseValue = (value, type) => {
  try {
    switch (type) {
      case "number":
        return Number(value);

      case "boolean":
        return value === "1" || value === 1 || value === true;

      case "json":
        return typeof value === "string" ? JSON.parse(value) : value;

      default:
        return value;
    }
  } catch (err) {
    return value;
  }
};

const stringifyValue = (value, type) => {
  if (type === "json") return JSON.stringify(value);
  if (type === "boolean") return value ? "1" : "0";
  return String(value);
};

module.exports = { parseValue, stringifyValue };
