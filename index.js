#!/usr/bin/env node
'use strict'
const os = require('os')
const fs = require('fs')
const path = require('path')
const JSON = require('./json')
const std = require('./std')

try {
  require(path.join(os.homedir(), '.fxrc')) // Should be required before config.js usage.
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') {
    throw err
  }
}

const print = require('./print')
const reduce = require('./reduce')
const stream = require('./stream')

const usage = `
  Usage
    $ fx [code ...]

  Examples
    $ echo '{"key": "value"}' | fx 'x => x.key'
    value

    $ echo '{"key": "value"}' | fx .key
    value

    $ echo '[1,2,3]' | fx 'this.map(x => x * 2)'
    [2, 4, 6]

    $ echo '{"items": ["one", "two"]}' | fx 'this.items' 'this[1]'
    two

    $ echo '{"count": 0}' | fx '{...this, count: 1}'
    {"count": 1}

    $ echo '{"foo": 1, "bar": 2}' | fx ?
    ["foo", "bar"]

`

const {stdin, stdout, stderr} = process
var args = process.argv.slice(2)
var interactive = false

void function main() {
  if (args.indexOf('-I') >= 0) {
    args = args.filter(a => a != '-I')
    interactive = true
  }

  let input = '';
  let filename = 'fx'

  if (stdin.isTTY) {
    if (args.length === 0 || (args.length === 1 && (args[0] === '-h' || args[0] === '--help'))) {
      stderr.write(usage)
      process.exit(2)
    }
    if (args.length === 1 && (args[0] === '-v' || args[0] === '--version')) {
      stderr.write(require('./package.json').version + '\n')
      process.exit(2)
    }
    if (args.length === 1 && args[0] === '--life') {
      require('./bang')
      return
    }

    input = fs.readFileSync(args[0]).toString('utf8')
    filename = path.basename(args[0])
    global.FX_FILENAME = filename
    args.shift()
  } else {
    input = fs.readFileSync(process.stdin.fd, 'utf-8')
    interactive |= args.length == 0
  }

  let json
  try {
    json = JSON.parse(input)
    json = reduce_args(json)
  } catch (e) {
    printError(e, input)
    process.exit(1)
  }

  if (interactive) {
    require('./fx')(filename, json)
  } else {
    handle_piped(json)
  }
}()

function reduce_args(json) {
  let reduced = json

  for (let [i, code] of args.entries()) {
    try {
      reduced = reduce(reduced, code)
    } catch (e) {
      if (e === std.skip) {
        return
      }
      stderr.write(`${snippet(i, code)}\n${e.stack || e}\n`)
      process.exit(1)
    }
  }

  return reduced
}

function handle_piped(output) {
  if (typeof output === 'undefined') {
    stderr.write('undefined\n')
  } else if (typeof output === 'string') {
    console.log(output)
  } else {
    const [text] = print(output)
    console.log(text)
  }
}

function snippet(i, code) {
  let pre = args.slice(0, i).join(' ')
  let post = args.slice(i + 1).join(' ')
  if (pre.length > 20) {
    pre = '...' + pre.substring(pre.length - 20)
  }
  if (post.length > 20) {
    post = post.substring(0, 20) + '...'
  }
  const chalk = require('chalk')
  return `\n  ${pre} ${chalk.red.underline(code)} ${post}\n`
}

function printError(e, input) {
  if (e.char) {
    let lineNumber = 1, start = e.char - 70, end = e.char + 50
    if (start < 0) start = 0
    if (end > input.length) end = input.length

    for (let i = 0; i < input.length && i < start; i++) {
      if (input[i] === '\n') lineNumber++
    }

    let lines = input
      .substring(start, end)
      .split('\n')

    if (lines.length > 1) {
      lines = lines.slice(1)
      lineNumber++
    }

    const chalk = require('chalk')
    process.stderr.write(`\n`)
    for (let line of lines) {
      process.stderr.write(`  ${chalk.yellow(lineNumber)}  ${line}\n`)
      lineNumber++
    }
    process.stderr.write(`\n`)
  }
  process.stderr.write(e.toString() + '\n')
}
