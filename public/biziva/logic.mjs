const secret =
  /authorization|password|passwd|secret|token|apikey|credential|cookie/i;
export function parse(text) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > 1024 * 1024
  )
    throw Error("JSON deve ter até 1 MiB.");
  return JSON.parse(text);
}
export function redact(value, hideContacts = false) {
  let count = 0,
    nodes = 0;
  function walk(v, depth = 0) {
    if (++nodes > 50000 || depth > 64)
      throw Error("Estrutura muito grande ou profunda.");
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    const result = Object.create(null);
    for (const [key, item] of Object.entries(v)) {
      const norm = key.replace(/[^a-z]/gi, "");
      if (
        secret.test(norm) ||
        (hideContacts &&
          /^(email|phone|telefone|celular|cpf|cnpj)$/i.test(norm))
      ) {
        result[key] = "[PROTEGIDO]";
        count++;
      } else result[key] = walk(item, depth + 1);
    }
    return result;
  }
  return { value: walk(value), redacted: count, nodes };
}
const pointer = (k) => String(k).replaceAll("~", "~0").replaceAll("/", "~1");
export function diff(a, b) {
  const changes = [];
  let visited = 0;
  function walk(x, y, path = "") {
    if (++visited > 100000) throw Error("Comparação muito grande.");
    if (changes.length >= 2000)
      throw Error("Mais de 2.000 diferenças. Reduza o documento.");
    if (Object.is(x, y)) return;
    if (
      x !== null &&
      y !== null &&
      typeof x === "object" &&
      typeof y === "object" &&
      Array.isArray(x) === Array.isArray(y)
    ) {
      for (const key of [
        ...new Set([...Object.keys(x), ...Object.keys(y)]),
      ].sort()) {
        const p = path + "/" + pointer(key);
        if (!Object.hasOwn(x, key))
          changes.push({ path: p, type: "adicionado" });
        else if (!Object.hasOwn(y, key))
          changes.push({ path: p, type: "removido" });
        else walk(x[key], y[key], p);
      }
      return;
    }
    changes.push({ path: path || "/", type: "alterado" });
  }
  walk(a, b);
  return changes;
}
export async function process(input) {
  const source = redact(parse(input.source), input.contacts);
  if (input.compare?.trim()) {
    const target = redact(parse(input.compare), input.contacts);
    const changes = diff(source.value, target.value);
    return {
      text: JSON.stringify(
        { changes, protected_fields: source.redacted + target.redacted },
        null,
        2,
      ),
      filename: "diferencas-biziva.json",
      mime: "application/json",
      summary:
        changes.length +
        " mudanças estruturais. Valores secretos não aparecem no relatório.",
    };
  }
  return {
    text: JSON.stringify(source.value, null, 2),
    filename: "json-protegido-biziva.json",
    mime: "application/json",
    summary:
      source.redacted +
      " campos protegidos. Revise o resultado antes de compartilhar.",
  };
}
