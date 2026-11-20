# Nexius Programming Language

Nexius is an experimental programming language with original syntax inspired by the readability of Python and the flexibility of JavaScript. The language is being designed with a long-term goal of native machine-code compilation and real-time event handling.

## Nexius Studio

The repository now includes **Nexius Studio**, a browser-based editor and compiler/runtime preview.

- Open the IDE: [Nexius Studio](https://catxproductions.github.io/Nexius-Programming-Language/)
- Source editor with line numbers
- Compile button with line-based diagnostics
- Run button and interactive input/output console
- Export source files as `.nx`

## Current language draft

### Comments
```nexius
...
This is a multiline comment
...

,,, This is a single-line comment
```

### Variables, input, and output
```nexius
playerName = input("What is your name? ")
output("Hello, " + playerName)
```

### Control structures
Blocks are closed with `--`.

```nexius
if -- score >= 100:
  output("You win!")
-- ELIF -- score >= 50:
  output("Almost there.")
-- ELSE --:
  output("Keep trying.")
--

while -- counter < 5:
  output(counter)
  counter = counter + 1
--
```

### Functions
```nexius
define -- greet():
  output("Hello from Nexius!")
--

greet()
```

### Comparisons and calculations

| Operator | Meaning |
|---|---|
| `==` | Equal |
| `/=` | Not equal |
| `<`, `>` | Less than, greater than |
| `<=`, `>=` | Less/greater than or equal |
| `+`, `-`, `*`, `/` | Arithmetic |
| `#value` | Square root |

Boolean expression syntax:
```nexius
isReady = boolIf -- score >= 100 --
```

## Current implementation status

The browser preview currently parses Nexius source into an internal syntax tree and executes that tree in a JavaScript-based Nexius runtime. It is **not yet generating native machine code or WebAssembly**. That is a later compiler-backend milestone.

Current preview supports variables, numeric/string expressions, comparisons, `input()`, `output()`, `if/ELIF/ELSE`, `while`, zero-argument functions, and the comment forms above. Function parameters, return values, arrays, pointers, real-time event listeners, and native compilation are not implemented yet.

## Running locally

Serve this folder with any static web server, or enable GitHub Pages for the repository using the `main` branch and root folder. Then open `index.html` in a browser.

Nexius is under active development; syntax and runtime behavior may change as the language specification matures.
