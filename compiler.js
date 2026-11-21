/* Nexius Studio compiler front-end: lexer/parser for the published Nexius draft syntax. */
(() => {
  "use strict";

  class NexiusError extends Error {
    constructor(message, line) { super(message); this.name = "NexiusError"; this.line = line || 1; }
  }

  function stripComments(source) {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const kept = [];
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (inBlock) {
        const end = line.indexOf("...");
        if (end < 0) { kept.push(""); continue; }
        line = line.slice(end + 3);
        inBlock = false;
      }
      while (true) {
        const start = line.indexOf("...");
        if (start < 0) break;
        const end = line.indexOf("...", start + 3);
        if (end < 0) { line = line.slice(0, start); inBlock = true; break; }
        line = line.slice(0, start) + line.slice(end + 3);
      }
      const single = line.indexOf(",,,");
      if (single >= 0) line = line.slice(0, single);
      kept.push(line);
    }
    if (inBlock) throw new NexiusError("Unclosed multiline comment. Add a closing ...", lines.length);
    return kept;
  }

  function tokenizeExpression(text, line) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      if (/\s/.test(text[i])) { i++; continue; }
      const rest = text.slice(i);
      const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (number) { tokens.push({ type: "number", value: Number(number[0]) }); i += number[0].length; continue; }
      if (text[i] === '"' || text[i] === "'" || text[i] === "“" || text[i] === "‘") {
        const opening = text[i++];
        const quote = opening === "“" ? "”" : opening === "‘" ? "’" : opening;
        let value = "";
        while (i < text.length && text[i] !== quote) {
          if (text[i] === "\\" && i + 1 < text.length) {
            const n = text[++i]; value += n === "n" ? "\\n" : n === "t" ? "\\t" : n; i++;
          } else value += text[i++];
        }
        if (text[i] !== quote) throw new NexiusError("Unterminated string.", line);
        i++; tokens.push({ type: "string", value }); continue;
      }
      const op = ["==", "/=", "<=", ">=", "--"].find(x => rest.startsWith(x));
      if (op) { tokens.push({ type: "op", value: op }); i += op.length; continue; }
      if ("+-*/#<>()[], ".includes(text[i])) { const value = text[i++]; if (value !== " ") tokens.push({ type: "op", value }); continue; }
      const id = rest.match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/);
      if (id) { const value = id[0]; tokens.push({ type: /^or$/i.test(value) ? "op" : "id", value: /^or$/i.test(value) ? "or" : value }); i += id[0].length; continue; }
      throw new NexiusError("Unexpected character '" + text[i] + "' in expression.", line);
    }
    tokens.push({ type: "eof", value: "" });
    return tokens;
  }

  const PRECEDENCE = { "or": 0, "==": 1, "/=": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3 };
  function parseExpression(text, line) {
    const tokens = tokenizeExpression(text, line); let pos = 0;
    const peek = () => tokens[pos];
    const take = () => tokens[pos++];
    function primary() {
      const t = take();
      if (t.type === "number" || t.type === "string") return { type: "literal", value: t.value };
      if (t.type === "id") {
        if (t.value === "true" || t.value === "false") return { type: "literal", value: t.value === "true" };
        if (t.value === "boolIf") {
          if (peek().value !== "--") throw new NexiusError("Expected -- after boolIf.", line);
          take(); const inner = expression(0);
          if (peek().value !== "--") throw new NexiusError("Expected closing -- after boolIf condition.", line);
          take(); return { type: "boolIf", expression: inner };
        }
        if (peek().value === "(") {
          take(); const args = [];
          if (peek().value !== ")") {
            do { args.push(expression(0)); if (peek().value !== ",") break; take(); } while (true);
          }
          if (peek().value !== ")") throw new NexiusError("Expected ) after function arguments.", line);
          take(); return { type: "call", name: t.value, args };
        }
        return { type: "variable", name: t.value };
      }
      if (t.value === "(") {
        if (peek().value === ")") { take(); return { type: "list", items: [] }; }
        const first = expression(0);
        if (peek().value === ",") {
          const items = [first];
          while (peek().value === ",") {
            take();
            if (peek().value === ")") break;
            items.push(expression(0));
          }
          if (peek().value !== ")") throw new NexiusError("Expected closing ) after list values.", line);
          take(); return { type: "list", items };
        }
        if (peek().value !== ")") throw new NexiusError("Expected closing ).", line);
        take(); return first;
      }
      if (t.value === "[") throw new NexiusError("A list index must follow a value, like numbers[0].", line);
      if (t.value === "-" || t.value === "#") return { type: "unary", op: t.value, right: expression(4) };
      throw new NexiusError("Expected a value in expression.", line);
    }
    function expression(min) {
      let left = primary();
      while (peek().value === "[") {
        take(); const index = expression(0);
        if (peek().value !== "]") throw new NexiusError("Expected ] after list index.", line);
        take(); left = { type: "index", target: left, index };
      }
      while (peek().type === "op" && PRECEDENCE[peek().value] !== undefined && PRECEDENCE[peek().value] >= min) {
        const op = take().value; const p = PRECEDENCE[op];
        const right = expression(p + 1);
        left = { type: "binary", op, left, right };
      }
      return left;
    }
    const result = expression(0);
    if (peek().type !== "eof") throw new NexiusError("Unexpected token '" + peek().value + "' in expression.", line);
    return result;
  }

  function parse(source) {
    const lines = stripComments(source);
    const records = lines.map((raw, i) => ({ raw, text: raw.trim(), line: i + 1 })).filter(x => x.text);
    const importedModules = new Set();
    const neuralModule = window.NexiusModules && window.NexiusModules.neural;
    let p = 0;
    const stop = (s) => s === "--" || s.startsWith("-- ELIF --") || s.startsWith("-- ELSE --");
    function block() {
      const body = [];
      while (p < records.length && !stop(records[p].text)) {
        const r = records[p++], s = r.text;
        let m;
        if ((m = s.match(/^imp\.([A-Za-z_][A-Za-z0-9_]*)$/i))) {
          const moduleName = m[1].toLowerCase();
          if (moduleName !== "neural" || !neuralModule) throw new NexiusError("Optional module '" + moduleName + "' is not available.", r.line);
          importedModules.add(moduleName);
          body.push({ type: "import", name: moduleName, line: r.line }); continue;
        }
        let neuralHeader = null;
        if (neuralModule) {
          try { neuralHeader = neuralModule.parseLayerHeader(s); }
          catch (error) { throw new NexiusError(error.message, r.line); }
        }
        if (neuralHeader) {
          m = neuralHeader;
          if (!importedModules.has("neural")) throw new NexiusError("Add imp.neural before declaring Neural layers.", r.line);
          const layerName = m.layer.toLowerCase(), entries = [];
          while (p < records.length && records[p].text !== "--") {
            const entryRecord = records[p++];
            const entry = neuralModule.parseLayerEntry(entryRecord.text, layerName);
            if (!entry) throw new NexiusError("Invalid " + layerName + " entry. Check its neuron identifier and syntax.", entryRecord.line);
            if (entry.index !== entries.length + 1) throw new NexiusError("Neuron identifiers must be sequential, starting at 1 (expected " + (entries.length + 1) + ").", entryRecord.line);
            entries.push(entry);
          }
          if (p >= records.length || records[p].text !== "--") throw new NexiusError("Expected -- to close Neural layer.", r.line);
          p++;
          if (entries.length !== m.amount) throw new NexiusError("This " + layerName + " declares " + m.amount + " entries but contains " + entries.length + ".", r.line);
          body.push({ type: "neuralLayer", model: m.model, layer: layerName, amount: m.amount, entries, line: r.line }); continue;
        }
        if ((m = s.match(/^if\s+--\s*(.*?)\s*:\s*$/i))) {
          const branches = [];
          branches.push({ condition: parseExpression(m[1], r.line), body: block() });
          while (p < records.length && records[p].text.startsWith("-- ELIF --")) {
            const e = records[p++], em = e.text.match(/^--\s*ELIF\s+--\s*(.*?)\s*:\s*$/i);
            if (!em) throw new NexiusError("Invalid ELIF syntax.", e.line);
            branches.push({ condition: parseExpression(em[1], e.line), body: block() });
          }
          let otherwise = [];
          if (p < records.length && records[p].text.startsWith("-- ELSE --")) {
            const e = records[p++];
            if (!/^--\s*ELSE\s+--\s*:\s*$/i.test(e.text)) throw new NexiusError("Expected -- ELSE --:", e.line);
            otherwise = block();
          }
          if (p >= records.length || records[p].text !== "--") throw new NexiusError("Expected -- to close if block.", r.line);
          p++; body.push({ type: "if", branches, otherwise, line: r.line }); continue;
        }
        if ((m = s.match(/^(perm\.)?on\s*\((.*)\)\s*(press|release)\s+--\s*:\s*$/i))) {
          const keyExpression = parseExpression(m[2], r.line);
          const commands = block();
          if (p >= records.length || records[p].text !== "--") throw new NexiusError("Expected -- to close key event block.", r.line);
          p++; body.push({ type: "keyEvent", keyExpression, event: m[3].toLowerCase(), persistent: Boolean(m[1]), body: commands, line: r.line }); continue;
        }
        if ((m = s.match(/^loop\s+--\s*\((.*)\)\s*:\s*$/i))) {
          const amount = parseExpression(m[1], r.line);
          const commands = block();
          if (p >= records.length || records[p].text !== "--") throw new NexiusError("Expected -- to close Loop block.", r.line);
          p++; body.push({ type: "repeat", amount, body: commands, line: r.line }); continue;
        }
        if ((m = s.match(/^while\s+--\s*(.*?)\s*:\s*$/i))) {
          const commands = block();
          if (p >= records.length || records[p].text !== "--") throw new NexiusError("Expected -- to close while block.", r.line);
          p++; body.push({ type: "while", condition: parseExpression(m[1], r.line), body: commands, line: r.line }); continue;
        }
        if ((m = s.match(/^define\s+--\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*:\s*$/i))) {
          const commands = block();
          if (p >= records.length || records[p].text !== "--") throw new NexiusError("Expected -- to close function.", r.line);
          p++; body.push({ type: "define", name: m[1], body: commands, line: r.line }); continue;
        }
        if (s === "--" || s.startsWith("-- ELIF") || s.startsWith("-- ELSE")) throw new NexiusError("Unexpected block closing marker.", r.line);
        if ((m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/))) {
          body.push({ type: "assign", name: m[1], expression: parseExpression(m[2], r.line), line: r.line }); continue;
        }
        if ((m = s.match(/^output\s*\((.*)\)\s*$/))) {
          const call = m[1].trim() ? parseExpression("__nexius_output__(" + m[1] + ")", r.line) : null;
          body.push({ type: "output", expressions: call ? call.args : [], line: r.line }); continue;
        }
        if ((m = s.match(/^(perm\.)?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\((.*)\)\s*$/))) {
          const args = m[3].trim() ? parseExpression("__nexius_call__(" + m[3] + ")", r.line).args : [];
          body.push({ type: "callStatement", name: m[2], args, persistent: Boolean(m[1]), line: r.line }); continue;
        }
        throw new NexiusError("I don't understand this statement: " + s, r.line);
      }
      return body;
    }
    const ast = block();
    if (p < records.length) throw new NexiusError("Unexpected block marker.", records[p].line);
    return ast;
  }

  function compile(source) {
    const ast = parse(source);
    return { ast, instructionCount: count(ast) };
  }
  function count(nodes) {
    return nodes.reduce((n, x) => n + 1 + (x.body ? count(x.body) : 0) + (x.otherwise ? count(x.otherwise) : 0) +
      (x.branches ? x.branches.reduce((a, b) => a + count(b.body), 0) : 0), 0);
  }

  function formatOutput(value) {
    if (Array.isArray(value)) return "[" + value.map(formatOutput).join(", ") + "]";
    if (value === null || value === undefined) return String(value);
    return String(value);
  }

  async function run(compiled, hooks, options) {
    hooks = hooks || {}; options = options || {};
    const vars = Object.create(null), functions = Object.create(null);
    const loadedModules = new Set();
    const neuralRuntime = window.NexiusModules && window.NexiusModules.neural ? window.NexiusModules.neural.createRuntime() : null;
    let stopped = false, steps = 0;
    const keyStates = new Map(), keyHandlers = [], trackedKeys = new Set(), eventWaiters = [];
    let eventQueue = Promise.resolve(), eventError = null;
    const maxSteps = options.maxSteps || 100000;
    const shouldStop = () => stopped || Boolean(hooks.isStopped && hooks.isStopped());
    const normalizeKey = value => String(value).toLowerCase() === " " ? "space" : String(value).toLowerCase();
    const output = (value) => hooks.output && hooks.output(String(value));
    const readInput = async (prompt) => {
      if (!hooks.input) return "";
      return await hooks.input(prompt);
    };
    function evaluate(node) {
      if (!node) return null;
      if (node.type === "literal") return node.value;
      if (node.type === "list") return node.items.map(evaluate);
      if (node.type === "index") {
        const target = evaluate(node.target), index = evaluate(node.index);
        if (!Array.isArray(target)) throw new NexiusError("Only lists can be indexed.");
        if (!Number.isInteger(Number(index)) || Number(index) < 0 || Number(index) >= target.length) throw new NexiusError("List index is out of range.");
        return target[Number(index)];
      }
      if (node.type === "variable") {
        if (!(node.name in vars)) throw new NexiusError("Variable '" + node.name + "' is not defined.");
        return vars[node.name];
      }
      if (node.type === "boolIf") return Boolean(evaluate(node.expression));
      if (node.type === "unary") {
        const v = evaluate(node.right);
        if (node.op === "-") return -Number(v);
        if (node.op === "#") { if (Number(v) < 0) throw new NexiusError("Cannot take the square root of a negative number."); return Math.sqrt(Number(v)); }
      }
      if (node.type === "binary") {
        const a = evaluate(node.left);
        if (node.op === "or") return Boolean(a) || Boolean(evaluate(node.right));
        const b = evaluate(node.right);
        switch (node.op) {
          case "+": return typeof a === "string" || typeof b === "string" ? String(a) + String(b) : Number(a) + Number(b);
          case "-": return Number(a) - Number(b); case "*": return Number(a) * Number(b);
          case "/": if (Number(b) === 0) throw new NexiusError("Division by zero."); return Number(a) / Number(b);
          case "==": return a === b || (typeof a === "number" && typeof b === "number" && a === b);
          case "/=": return a !== b; case "<": return a < b; case ">": return a > b;
          case "<=": return a <= b; case ">=": return a >= b;
        }
      }
      if (node.type === "call") {
        if (/^neural\.getout[1-9][0-9]*$/i.test(node.name)) {
          if (!loadedModules.has("neural") || !neuralRuntime) throw new NexiusError("Import neural with imp.neural before using Neural functions.");
          if (node.args.length !== 1 || node.args[0].type !== "variable") throw new NexiusError(node.name + "() requires one model name.");
          const index = Number(node.name.match(/getout([0-9]+)/i)[1]);
          try { return neuralRuntime.getOutput(node.args[0].name, index, vars); }
          catch (error) { throw new NexiusError(error.message); }
        }
        if (node.name === "input") return readInput(node.args.length ? evaluate(node.args[0]) : "");
        if (node.name === "checkfor") {
          if (node.args.length !== 1) throw new NexiusError("checkfor() requires exactly one key.");
          return Boolean(keyStates.get(normalizeKey(evaluate(node.args[0]))));
        }
        throw new NexiusError("Unknown function '" + node.name + "'.");
      }
      return null;
    }
    async function execute(nodes) {
      for (const node of nodes) {
        if (shouldStop()) { stopped = true; return; }
        if (++steps > maxSteps) throw new NexiusError("Execution stopped: maximum instruction count reached (possible infinite loop).", node.line);
        if (node.type === "import") {
          loadedModules.add(node.name);
        } else if (node.type === "neuralLayer") {
          if (!loadedModules.has("neural") || !neuralRuntime) throw new NexiusError("Import neural with imp.neural before declaring Neural layers.", node.line);
          try { neuralRuntime.declareLayer(node); } catch (error) { throw new NexiusError(error.message, node.line); }
        } else if (node.type === "assign") {
          if (node.expression.type === "call" && (node.expression.name === "input" || node.expression.name === "numinput")) {
            const isNumber = node.expression.name === "numinput";
            const raw = await readInput(node.expression.args.length ? evaluate(node.expression.args[0]) : "", isNumber ? "number" : "text");
            if (isNumber) {
              const value = Number(raw);
              if (String(raw).trim() === "" || !Number.isFinite(value)) {
                throw new NexiusError("numinput() requires a valid number.", node.line);
              }
              vars[node.name] = value;
            } else vars[node.name] = raw;
          } else vars[node.name] = evaluate(node.expression);
        } else if (node.type === "output") {
          const values = [];
          for (const expression of node.expressions || []) {
            let value = evaluate(expression);
            if (value && typeof value.then === "function") value = await value;
            values.push(formatOutput(value));
          }
          output(values.join(" "));
        } else if (node.type === "if") {
          let matched = false;
          for (const branch of node.branches) if (evaluate(branch.condition)) { matched = true; await execute(branch.body); break; }
          if (!matched) await execute(node.otherwise);
        } else if (node.type === "repeat") {
          const amount = Number(evaluate(node.amount));
          if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
            throw new NexiusError("Loop amount must be a non-negative whole number.", node.line);
          }
          if (amount > maxSteps) throw new NexiusError("Loop amount exceeds the execution limit.", node.line);
          for (let iteration = 0; iteration < amount && !shouldStop(); iteration++) {
            await execute(node.body);
            if ((iteration + 1) % 256 === 0) await new Promise(resolve => setTimeout(resolve, 0));
          }
        } else if (node.type === "while") {
          let iterations = 0;
          while (evaluate(node.condition) && !shouldStop()) {
            if (++iterations > maxSteps) throw new NexiusError("Loop limit reached; check your while condition.", node.line);
            await execute(node.body);
            if (iterations % 256 === 0) await new Promise(resolve => setTimeout(resolve, 0));
          }
        } else if (node.type === "define") functions[node.name] = node.body;
        else if (node.type === "keyEvent") {
          const key = normalizeKey(evaluate(node.keyExpression));
          if (node.persistent) {
            keyHandlers.push({ key, event: node.event, persistent: true, body: node.body, line: node.line, active: true });
          } else {
            // A normal on(...) block pauses this program position until its event occurs.
            await new Promise((resolve, reject) => {
              let settled = false;
              const waiter = { key, event: node.event, resolve: () => {
                if (settled) return;
                settled = true;
                const index = eventWaiters.indexOf(waiter);
                if (index >= 0) eventWaiters.splice(index, 1);
                resolve();
              }};
              eventWaiters.push(waiter);
              const checkStopped = () => {
                if (settled) return;
                if (shouldStop()) {
                  settled = true;
                  const index = eventWaiters.indexOf(waiter);
                  if (index >= 0) eventWaiters.splice(index, 1);
                  resolve();
                  return;
                }
                waiter.stopTimer = setTimeout(checkStopped, 25);
              };
              waiter.stopTimer = setTimeout(checkStopped, 25);
            });
            if (!shouldStop()) await execute(node.body);
          }
        }
        else if (node.type === "callStatement") {
          if (node.name === "neural.assemble") {
            if (!loadedModules.has("neural") || !neuralRuntime) throw new NexiusError("Import neural with imp.neural before using Neural functions.", node.line);
            if ((node.args || []).length !== 1 || node.args[0].type !== "variable") throw new NexiusError("neural.assemble() requires one model name.", node.line);
            try {
              const sizes = neuralRuntime.assemble(node.args[0].name);
              output("Assembled neural model " + node.args[0].name + " (" + sizes.join("-") + ").");
            } catch (error) { throw new NexiusError(error.message, node.line); }
          } else if (node.name === "neural.run") {
            if (!loadedModules.has("neural") || !neuralRuntime) throw new NexiusError("Import neural with imp.neural before using Neural functions.", node.line);
            if ((node.args || []).length !== 1 || !node.args[0] || node.args[0].type !== "variable") throw new NexiusError("neural.run() requires one model name.", node.line);
            try {
              const values = neuralRuntime.run(node.args[0].name, vars);
              output("Neural model " + node.args[0].name + " ran (" + values.length + " outputs updated).");
            } catch (error) { throw new NexiusError(error.message, node.line); }
          } else if (/^neural\.(correct|reward|observe)$/i.test(node.name)) {
            if (!loadedModules.has("neural") || !neuralRuntime) throw new NexiusError("Import neural with imp.neural before using Neural functions.", node.line);
            const method = node.name.split(".")[1].toLowerCase();
            const args = node.args || [];
            const validCount = method === "observe" ? args.length === 1 : (args.length === 1 || args.length === 2);
            if (!validCount || !args[0] || args[0].type !== "variable") {
              throw new NexiusError("neural." + method + "() requires a model name" + (method === "observe" ? "." : " and an optional feedback strength."), node.line);
            }
            const strength = args.length === 2 ? Number(evaluate(args[1])) : 1;
            try {
              neuralRuntime[method](args[0].name, strength);
              if (method === "reward") output("Neural reward applied to " + args[0].name + ".");
              else if (method === "correct") output("Neural correction applied to " + args[0].name + ".");
            } catch (error) { throw new NexiusError(error.message, node.line); }
          } else if (node.name === "clear") {
            if ((node.args || []).length !== 0) throw new NexiusError("clear() does not accept arguments.", node.line);
            if (hooks.clear) hooks.clear();
          } else if (node.name === "checkfor") {
            if ((node.args || []).length !== 1) throw new NexiusError("checkfor() requires exactly one key.", node.line);
            if (!node.persistent) throw new NexiusError("Use perm.checkfor(key) to keep key tracking active until the program ends.", node.line);
            const key = normalizeKey(evaluate(node.args[0]));
            trackedKeys.add(key);
          } else if (node.name === "wait") {
            if ((node.args || []).length !== 1) throw new NexiusError("wait() requires exactly one time value in seconds.", node.line);
            const seconds = Number(evaluate(node.args[0]));
            if (!Number.isFinite(seconds) || seconds < 0) throw new NexiusError("wait() requires a non-negative number of seconds.", node.line);
            if (typeof hooks.onFrame === "function") await hooks.onFrame(vars, seconds);
            const endTime = Date.now() + seconds * 1000;
            while (!shouldStop() && Date.now() < endTime) {
              await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(0, endTime - Date.now()))));
            }
          } else {
            if (!functions[node.name]) throw new NexiusError("Function '" + node.name + "' is not defined.", node.line);
            if ((node.args || []).length !== 0) throw new NexiusError("User-defined functions do not accept arguments yet.", node.line);
            await execute(functions[node.name]);
          }
        }
      }
    }
    let removeKeyListener = null;
    if (hooks.onKeyEvent) {
      removeKeyListener = hooks.onKeyEvent((eventName, rawKey) => {
        const key = normalizeKey(rawKey);
        keyStates.set(key, eventName === "press");
        const waiting = eventWaiters.filter(waiter => waiter.key === key && waiter.event === eventName);
        for (const waiter of waiting) waiter.resolve();
        const matches = keyHandlers.filter(handler => handler.active && handler.key === key && handler.event === eventName);
        for (const handler of matches) {
          eventQueue = eventQueue.then(async () => {
            if (!shouldStop()) await execute(handler.body);
          }).catch(error => { eventError = error; stopped = true; });
        }
      });
    }
    try {
      await execute(compiled.ast);
      const hasPendingEvents = () => keyHandlers.some(handler => handler.active) || trackedKeys.size > 0;
      while (!shouldStop() && hasPendingEvents()) {
        if (eventError) throw eventError;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await eventQueue;
      if (eventError) throw eventError;
      return { variables: vars, steps, stopped: shouldStop() };
    } finally {
      if (typeof removeKeyListener === "function") removeKeyListener();
    }
  }
  window.NexiusCompiler = { compile, run, NexiusError };
})();