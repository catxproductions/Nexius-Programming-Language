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
    a.href = url; a.download = "main.nx"; a.click(); URL.revokeObjectURL(url);
  });
  source.addEventListener("input", () => { compiled = null; updateLines(); updateCursor(); setStatus("Unsaved changes", true); });
  source.addEventListener("click", updateCursor); source.addEventListener("keyup", updateCursor);
  source.addEventListener("scroll", () => { $("lineNumbers").scrollTop = source.scrollTop; });
  source.addEventListener("keydown", e => {
    if (e.key === "Tab") { e.preventDefault(); const a=source.selectionStart,b=source.selectionEnd; source.setRangeText("  ",a,b,"end"); updateLines(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && running) $("stopBtn").click(); });
  updateLines(); updateCursor();
})();