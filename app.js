(() => {
  const $ = (id) => document.getElementById(id);
  const source = $("source"), consoleEl = $("console"), diagnostics = $("diagnostics");
  const sample = `,,, Welcome to Nexius Studio
name = input("What is your name? ")
output("Hello, " + name)

if -- name == "Nexius" :
  output("Language creator detected.")
-- ELSE --:
  output("Nice to meet you!")
--
`;
  source.value = sample;
  let waitingInput = null, stopped = false, running = false, compiled = null;
  function setStatus(text, good) {
    $("compileState").textContent = text;
    $("footerStatus").textContent = text;
    $("statusDot").style.background = good === false ? "var(--red)" : "var(--green)";
  }
  function addLine(text, type) {
    const placeholder = consoleEl.querySelector(".placeholder");
    if (placeholder) placeholder.remove();
    const line = document.createElement("div");
    line.className = "console-line " + (type || "");
    line.textContent = text;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
  function clearConsole() { consoleEl.replaceChildren(); }
  function showDiagnostics(items) {
    diagnostics.replaceChildren();
    $("messageCount").textContent = String(items.length);
    if (!items.length) {
      const p = document.createElement("div"); p.className = "placeholder"; p.textContent = "No errors or warnings."; diagnostics.appendChild(p); return;
    }
    for (const item of items) {
      const row = document.createElement("div"); row.className = "diagnostic " + (item.error ? "error" : "");
      const loc = document.createElement("span"); loc.className = "line"; loc.textContent = item.line ? "Line " + item.line : "Compiler";
      row.append(loc, document.createTextNode(item.message)); diagnostics.appendChild(row);
    }
  }
  function updateLines() {
    const count = source.value.split("\n").length;
    $("lineNumbers").textContent = Array.from({length:count}, (_,i) => i+1).join("\n");
  }
  function updateCursor() {
    const before = source.value.slice(0, source.selectionStart).split("\n");
    $("cursorPosition").textContent = "Ln " + before.length + ", Col " + (before[before.length-1].length+1);
  }

  // Context-aware Nexius recommendations
  let suggestionItems = [], selectedSuggestion = -1;
  const suggestionPanel = $("suggestions");
  function getEditorContext() {
    const cursor = source.selectionStart;
    const before = source.value.slice(0, cursor);
    const lines = before.split("\n");
    const current = lines[lines.length - 1];
    const indent = (current.match(/^\s*/) || [""])[0];
    const prior = lines.slice(0, -1);
    const previous = [...prior].reverse().find(line => line.trim());
    const openBlocks = [];
    for (const line of source.value.slice(0, cursor).split("\n")) {
      const t = line.trim();
      if (/^(if\s+--|while\s+--|loop\s+--|define\s+--|(?:perm\.)?on\s*\().*:\s*$/i.test(t)) openBlocks.push(t);
      else if (t === "--" && openBlocks.length) openBlocks.pop();
    }
    const variables = [...new Set([...source.value.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map(m => m[1]))];
    const functions = [...new Set([...source.value.matchAll(/^\s*define\s+--\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/gim)].map(m => m[1]))];
    return {cursor, current, indent, prior, previous, openBlocks, variables, functions};
  }
  function buildRecommendations() {
    const c = getEditorContext();
    const typed = c.current.slice(c.indent.length);
    const lower = typed.toLowerCase();
    const items = [];
    const add = (label, detail, insert, kind = "code") => items.push({label, detail, insert, kind});
    const commandList = [
      ["output(value)", "Print a value to the console", "output()"],
      ["input(prompt)", "Read text from the user", 'input("")'],
      ["numinput(prompt)", "Read a number from the user", 'numinput("")'],
      ["wait(seconds)", "Pause program execution", "wait(1)"],
      ["clear()", "Clear the program console", "clear()"],
      ["checkfor(key)", "Check whether a key is held", 'checkfor("w")'],
      ["perm.checkfor(key)", "Track a key until the program ends", 'perm.checkfor("w")']
    ];
    const structures = [
      ["if -- condition:", "Start a conditional block", "if -- condition:\n" + c.indent + "  \n" + c.indent + "--"],
      ["while -- condition:", "Repeat while a condition is true", "while -- condition:\n" + c.indent + "  \n" + c.indent + "--"],
      ["Loop --(amount):", "Repeat a fixed number of times", "Loop --(5):\n" + c.indent + "  \n" + c.indent + "--"],
      ["define -- name():", "Define a reusable function", "define -- functionName():\n" + c.indent + "  \n" + c.indent + "--"],
      ['on("key")press --:', "Run code when a key is pressed", 'on("w")press --:\n' + c.indent + "  \n" + c.indent + "--"],
      ['on("key")release --:', "Run code when a key is released", 'on("w")release --:\n' + c.indent + "  \n" + c.indent + "--"]
    ];
    const isBlank = !typed.trim();
    const matchesPrefix = (value) => value.toLowerCase().startsWith(lower);
    if (isBlank) {
      if (c.previous && /:\s*$/.test(c.previous.trim())) {
        add("Indent block body", "Add two spaces for the next block command", "  ", "indent");
      }
      if (c.openBlocks.length) add("Close current block  --", "Finish the open Nexius block", "--", "block");
      for (const [label,detail,insert] of structures) add(label,detail,insert,"structure");
      for (const [label,detail,insert] of commandList) add(label,detail,insert);
      for (const name of c.variables) add(name, "Use an existing variable", name, "variable");
      for (const name of c.functions) add(name + "()", "Call your function", name + "()", "function");
    } else {
      for (const [label,detail,insert] of [...structures,...commandList]) {
        const word = label.split(/[ (]/)[0];
        if (matchesPrefix(word)) add(label,detail,insert,structures.some(x => x[0] === label) ? "structure" : "code");
      }
      for (const name of c.variables) if (matchesPrefix(name)) add(name,"Use an existing variable",name,"variable");
      for (const name of c.functions) if (matchesPrefix(name)) add(name + "()","Call your function",name + "()","function");
      if (lower === "--" || lower === "-") add("--","Close the current block","--","block");
      if (/^(if|while|loop|define|on|perm\.)/.test(lower) && items.length === 0) {
        for (const [label,detail,insert] of structures) if (label.toLowerCase().startsWith(lower)) add(label,detail,insert,"structure");
      }
    }
    // Offer common variable names after an assignment has started.
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*$/.test(typed)) {
      add('input("prompt")', "Assign text input to this variable", 'input("")');
      add('numinput("prompt")', "Assign numeric input to this variable", 'numinput("")');
      add("true / false", "Assign a Boolean value", "true");
      add("(value1, value2)", "Create a list", "()");
    }
    suggestionItems = items.slice(0, 7);
    selectedSuggestion = -1;
    renderRecommendations();
  }
  function renderRecommendations() {
    suggestionPanel.replaceChildren();
    if (!suggestionItems.length) {
      const empty = document.createElement("div"); empty.className = "suggestion-empty";
      empty.textContent = "Start typing for Nexius syntax and completion suggestions.";
      suggestionPanel.appendChild(empty); return;
    }
    const heading = document.createElement("div"); heading.className = "suggestion-heading";
    heading.textContent = "RECOMMENDED NEXT STEPS"; suggestionPanel.appendChild(heading);
    suggestionItems.forEach((item,index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "suggestion-item" + (index === selectedSuggestion ? " selected" : "");
      const title = document.createElement("span"); title.className = "suggestion-title"; title.textContent = item.label;
      const detail = document.createElement("span"); detail.className = "suggestion-detail"; detail.textContent = item.detail;
      button.append(title,detail);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => applySuggestion(index));
      suggestionPanel.appendChild(button);
    });
  }
  function applySuggestion(index) {
    const item = suggestionItems[index]; if (!item) return;
    const cursor = source.selectionStart;
    const lineStart = source.value.lastIndexOf("\n", cursor - 1) + 1;
    const line = source.value.slice(lineStart, cursor);
    const indentLength = (line.match(/^\s*/) || [""])[0].length;
    const start = item.kind === "indent" ? cursor : lineStart + indentLength;
    source.setRangeText(item.insert, start, cursor, "end");
    source.focus(); compiled = null; updateLines(); updateCursor(); setStatus("Unsaved changes", true);
    buildRecommendations();
  }
  function moveSuggestionSelection(direction) {
    if (!suggestionItems.length) return;
    selectedSuggestion = (selectedSuggestion + direction + suggestionItems.length) % suggestionItems.length;
    renderRecommendations();
  }

  function compile() {
    try {
      compiled = NexiusCompiler.compile(source.value);
      showDiagnostics([]);
      setStatus("Compiled successfully · " + compiled.instructionCount + " statements", true);
      addLine("Compilation successful. " + compiled.instructionCount + " statements parsed.", "prompt");
      return true;
    } catch (err) {
      compiled = null;
      const message = err.message || "Unknown compiler error.";
      showDiagnostics([{message, line:err.line, error:true}]);
      setStatus("Compilation failed", false);
      addLine("Compiler error" + (err.line ? " on line " + err.line : "") + ": " + message, "error");
      return false;
    }
  }
  function requestInput(prompt, kind) {
    if (prompt) addLine(String(prompt), "prompt");
    $("programInput").disabled = false; $("sendInput").disabled = false;
    $("programInput").type = kind === "number" ? "number" : "text";
    $("programInput").step = kind === "number" ? "any" : "";
    $("programInput").placeholder = kind === "number" ? "Enter a number..." : "Type a value and press Enter...";
    $("programInput").focus();
    return new Promise(resolve => { waitingInput = resolve; });
  }
  function finishInput() {
    if (!waitingInput) return;
    const value = $("programInput").value;
    if ($("programInput").type === "number" && (value.trim() === "" || !Number.isFinite(Number(value)))) {
      addLine("Please enter a valid number.", "error");
      $("programInput").focus();
      return;
    }
    $("programInput").value = "";
    $("programInput").type = "text";
    $("programInput").step = "";
    addLine("> " + value, "prompt");
    const resolve = waitingInput; waitingInput = null;
    $("programInput").disabled = true; $("sendInput").disabled = true;
    resolve(value);
  }
  async function run() {
    if (running) return;
    clearConsole();
    if (!compiled && !compile()) return;
    running = true; stopped = false;
    $("runBtn").disabled = true; $("stopBtn").disabled = false;
    setStatus("Running...", true);
    try {
      const result = await NexiusCompiler.run(compiled, {
        output: value => addLine(String(value), "output"),
        input: (prompt, kind) => requestInput(prompt, kind),
        clear: () => clearConsole(),
        isStopped: () => stopped,
        onKeyEvent: callback => {
          const normalize = key => key === " " ? "space" : key.toLowerCase();
          const down = event => { if (!event.repeat) callback("press", normalize(event.key)); };
          const up = event => callback("release", normalize(event.key));
          document.addEventListener("keydown", down);
          document.addEventListener("keyup", up);
          return () => {
            document.removeEventListener("keydown", down);
            document.removeEventListener("keyup", up);
          };
        }
      }, {maxSteps:100000});
      if (stopped) addLine("Execution stopped.", "prompt");
      else addLine("Program finished. " + result.steps + " instructions executed.", "prompt");
      setStatus(stopped ? "Stopped" : "Execution completed", true);
    } catch (err) {
      showDiagnostics([{message:err.message || String(err), line:err.line, error:true}]);
      addLine("Runtime error: " + (err.message || String(err)), "error");
      setStatus("Runtime error", false);
    } finally {
      running = false; waitingInput = null;
      $("programInput").disabled = true; $("sendInput").disabled = true;
      $("runBtn").disabled = false; $("stopBtn").disabled = true;
    }
  }
  $("compileBtn").addEventListener("click", () => { addLine("Compiling...", "prompt"); compile(); });
  $("runBtn").addEventListener("click", run);
  $("stopBtn").addEventListener("click", () => { stopped = true; if (waitingInput) { const resolve=waitingInput; waitingInput=null; resolve(""); } });
  $("inputForm").addEventListener("submit", e => { e.preventDefault(); finishInput(); });
  $("clearBtn").addEventListener("click", clearConsole);
  $("newBtn").addEventListener("click", () => { if (confirm("Start a new Nexius file? Unsaved editor text will be replaced.")) { source.value = ""; compiled = null; updateLines(); clearConsole(); showDiagnostics([]); setStatus("New file", true); } });
  $("downloadBtn").addEventListener("click", () => {
    const blob = new Blob([source.value], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "nexcode.nexius"; a.click(); URL.revokeObjectURL(url);
  });
  source.addEventListener("input", () => { compiled = null; updateLines(); updateCursor(); setStatus("Unsaved changes", true); buildRecommendations(); });
  source.addEventListener("click", () => { updateCursor(); buildRecommendations(); }); source.addEventListener("keyup", () => { updateCursor(); buildRecommendations(); });
  source.addEventListener("scroll", () => { $("lineNumbers").scrollTop = source.scrollTop; });
  source.addEventListener("keydown", e => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = source.selectionStart, end = source.selectionEnd;
      if (start !== end) {
        const lineStart = source.value.lastIndexOf("\n", start - 1) + 1;
        const selected = source.value.slice(start, end);
        const lineCount = selected.split("\n").length;
        const insertAt = lineStart;
        source.setRangeText("  " + selected.replace(/\n/g, "\n  "), insertAt, end, "select");
        source.setSelectionRange(start + 2, start + 2 + selected.length + (lineCount - 1) * 2);
      } else {
        source.setRangeText("  ", start, end, "end");
      }
      compiled = null;
      updateLines(); updateCursor(); buildRecommendations();
      setStatus("Unsaved changes", true);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      run();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const start = source.selectionStart, end = source.selectionEnd;
      const lineStart = source.value.lastIndexOf("\n", start - 1) + 1;
      const linePrefix = source.value.slice(lineStart, start);
      const indent = (linePrefix.match(/^\s*/) || [""])[0];
      const nextIndent = /:\s*$/.test(linePrefix.trim()) ? indent + "  " : indent;
      source.setRangeText("\n" + nextIndent, start, end, "end");
      compiled = null;
      updateLines(); updateCursor(); buildRecommendations();
      setStatus("Unsaved changes", true);
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && running) $("stopBtn").click(); });
  updateLines(); updateCursor(); buildRecommendations();
})();