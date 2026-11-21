# Nexius Programming Language

Nexius is an experimental programming language with original syntax inspired by the readability of Python and the flexibility of JavaScript. The language is being designed with a long-term goal of native machine-code compilation and real-time event handling.

## Nexius Studio

The repository now includes **Nexius Studio**, a browser-based editor and compiler/runtime preview.

- Open the IDE: [Nexius Studio](https://catxproductions.github.io/Nexius-Programming-Language/)
- Source editor with line numbers
- Compile button with line-based diagnostics
- Run button and interactive input/output console
- Export source files as `.nexius`
- Open the [Nexius Language Documentation](https://catxproductions.github.io/Nexius-Programming-Language/docs.html) for syntax, commands, and language rules

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

### Lists and multiple output values

Comma-separated values inside parentheses create a list. Use square brackets with a zero-based index to read an item.

```nexius
numbers = (10, 20, 30)
names = ("Alex", "Sam", "Jordan")

output("Numbers:", numbers)
output("First number:", numbers[0])
output("Names:", names)
```

Multiple arguments to `output()` are printed on one line, separated by spaces. Lists display with square brackets.

### Console control

`clear()` clears the program console. `wait(time)` pauses execution for the given number of seconds before continuing.

```nexius
output("Starting...")
wait(2)
output("Two seconds later.")
clear()
output("The console was cleared.")
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

### Keyboard events

Use `checkfor(key)` in a condition to read whether a key is currently held. Event blocks let the programmer choose what happens on key presses and releases. Prefix a listener or tracking statement with `perm.` to keep it active until the program ends.

```nexius
perm.checkfor("w")

perm.on("w")press --:
  output("W pressed")
--

perm.on("w")release --:
  output("W released")
--

while -- checkfor("w") == true:
  output("W is held")
--
```

Without `perm.`, an `on(key)press` or `on(key)release` command pauses execution at that line until the next matching event, runs its block once, and then continues to the next statement. With `perm.`, the listener is registered and execution continues; its block runs for every matching event until the program ends or is stopped. The space bar is named `"space"`.

### Counted loops

Use `Loop --(amount):` to repeat a block a fixed number of times. The amount is evaluated once and must be a non-negative whole number.

```nexius
Loop --(5):
  output("This runs five times.")
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

Current preview supports variables, numeric/string expressions, comparisons, counted `Loop` blocks, lists with indexed access, `input()`, `numinput()`, multi-value `output()`, `clear()`, `wait(time)`, `if/ELIF/ELSE`, `while`, zero-argument functions, keyboard state checks, press/release event blocks, persistent `perm.` listeners, and the comment forms above. Function parameters, return values, pointers, real-time event listeners, arbitrary third-party modules, and native compilation are not implemented yet. The optional Neural module is documented below.

## Running locally

Serve this folder with any static web server, or enable GitHub Pages for the repository using the `main` branch and root folder. Then open `index.html` in a browser.

Nexius is under active development; syntax and runtime behavior may change as the language specification matures.

## Optional modules: Neural

Import Neural with `imp.neural`. This module adds network layer syntax and functions. The example declares a 3-5-3-3 feed-forward network:

```nexius
imp.neural

speed = 0.75
trackwalldistance = 0.30
temp = 0.50
gas = 0
brakes = 0
turning = 0

neural.nexiusRacingBot.inputLayer -- (3):
  neural.in1 = speed
  neural.in2 = trackwalldistance
  neural.in3 = temp
--

neural.nexiusRacingBot.hidden -- (2):
  neural.HL1(5)
  neural.HL2(3)
--

neural.nexiusRacingBot.outputLayer -- (3):
  neural.out1 = gas
  neural.out2 = brakes
  neural.out3 = turning
--

neural.assemble(nexiusRacingBot)
gas = neural.getout1(nexiusRacingBot)
```

Counts after `inputLayer` and `outputLayer` specify neuron counts. The count after `hidden` specifies the number of hidden layers; each `HLN(amount)` defines one hidden layer's size. Identifiers are sequential from 1 and local to their declaration. Inputs are live variable links. Requesting an output performs a forward pass and updates linked output variables. Initial weights are random and activation is sigmoid; training and weight persistence are not implemented yet.


### Experimental Neural feedback

After requesting a model output, Nexius can apply feedback to that most recent inference:

```nexius
gas = neural.getout1(SubmarineAI)
turning = neural.getout2(SubmarineAI)

if -- obstacleDetected == true:
  neural.correct(SubmarineAI)
-- ELIF -- goalReached == true:
  neural.reward(SubmarineAI, 2)
-- ELSE --:
  neural.observe(SubmarineAI)
--
```

`neural.observe(model)` stores the latest inference in a bounded history of up to 128 observations. `neural.reward(model[, strength])` applies positive feedback; `neural.correct(model[, strength])` applies negative feedback. Strength defaults to 1 and must be greater than 0 and no greater than 10. Feedback requires a recent `neural.getoutN()` call, and an inference can receive feedback only once.

This is an experimental reward-modulated gradient update, not a complete reinforcement-learning implementation. It adjusts the network toward increasing or decreasing the overall output vector; it does not yet perform per-action credit assignment, experience replay, or model persistence. Test learning in a simulation before connecting outputs to real equipment.
