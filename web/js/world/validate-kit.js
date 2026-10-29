// Comprobaciones elementales que acumulan los mensajes en el orden de las llamadas.
export function createValidationKit(errors = [], { prefix = '' } = {}) {
  const fail = (path, message) => {
    const text = `${prefix}${path}: ${message}`;
    if (errors instanceof Set) errors.add(text);
    else errors.push(text);
    return false;
  };
  const check = (valid, path, message) => valid || fail(path, message);
  return {
    errors,
    number(
      path,
      v,
      {
        min = -Infinity,
        max = Infinity,
        integer = false,
        exclusiveMin = false,
        message = 'se esperaba un número',
      } = {},
    ) {
      return check(
        Number.isFinite(v) &&
          (!integer || Number.isInteger(v)) &&
          (exclusiveMin ? v > min : v >= min) &&
          v <= max,
        path,
        message,
      );
    },
    oneOf(path, v, values, message) {
      return check(values.includes(v), path, message);
    },
    array(path, v, { min = 0, max = Infinity, message = 'se esperaba una lista' } = {}) {
      return check(Array.isArray(v) && v.length >= min && v.length <= max, path, message);
    },
    object(path, v, { keys, message = 'se esperaba un objeto' } = {}) {
      if (!check(v !== null && typeof v === 'object' && !Array.isArray(v), path, message))
        return false;
      if (keys)
        for (const k of Object.keys(v))
          if (!keys.includes(k)) fail(`${path}.${k}`, 'clave desconocida');
      return true;
    },
  };
}
