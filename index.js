const fs = require('fs')
const process = require('process')
const path = require('path')
const ignore = require('ignore')
const printf = require('printf')

function log (...msg) {
  console.log(printf(...msg))
}

function countLinesFile (docPath) {
  let linesCount = 1
  let characters = 0
  let fileString = fs.readFileSync(docPath).toString()
  for (let cha of fileString) {
    if (cha === '\n') {
      linesCount += 1
    } else {
      characters += 1
    }
  }
  let parse = path.parse(docPath)
  return {
    lines: linesCount,
    dir: docPath,
    base: parse.base,
    ext: parse.ext,
    characters: characters
  }
}

function countLinesDir (dirPath, ignoreRule) {
  if (!fs.existsSync(dirPath)) {
    return 0
  }
  let dirContents = fs.readdirSync(dirPath)
  let linesCount = 0
  let charactersCount = 0
  let justDir = []
  let files = []

  for (let content of dirContents) {
    if (ignoreRule.ignores(content)) {
      continue
    }
    let contentPath = path.join(dirPath, content)
    let contentStat = fs.statSync(contentPath)
    if (contentStat.isFile()) {
      let file = countLinesFile(contentPath)
      linesCount += file.lines
      charactersCount += file.characters
      files.push(file)
    } else if (contentStat.isDirectory()) {
      if (!ignoreRule.ignores(content + '/')) {
        justDir.push(content)
      }
    } else {
      console.error('Unknown state of the path:', contentPath)
      process.abort()
    }
  }

  // Print the result
  if (linesCount !== 0 && files.length !== 0) {
    log('\x1b[44mdir  %-51s (%5d, %8d)\x1b[0m', dirPath.replace(/\\/g, '/'), linesCount, charactersCount)
    for (let result of files) {
      log('\x1b[32mfile     %-47s (%5d, %8d)\x1b[0m', result.base, result.lines, result.characters)
    }
  }

  let folders = []
  for (let content of justDir) {
    let contentPath = path.join(dirPath, content)
    let folder = countLinesDir(contentPath, ignoreRule)
    linesCount += folder.lines
    charactersCount += folder.characters
    folders.push(folder)
  }

  return {
    lines: linesCount,
    characters: charactersCount,
    dir: dirPath,
    files: files,
    folders: folders
  }
}

function main () {
  if (process.argv.length < 3) {
    console.error('Please give the directory path.')
    process.abort()
  } else {
    let dirPath = process.argv[2]

    if (!fs.existsSync(dirPath)) {
      console.error('The directory path could not be reached.')
      process.abort()
    }

    // .gitignore
    let ignoreRule = ignore().add([
      'node_modules',
      '.git',
      '.gitignore',
      '.gitattributes',
      'LICENSE',
      'package.json',
      'package-lock.json',
      '.vscode',
      '.babelrc',
      '*.png',
      '*.mp3',
      '*.jpg',
      '*.gif',
      '*.svg',
      '*.md',
      '*.docx',
      '*.doc',
      '*.xlsx',
      '*.xls',
      '*.pdf',
      'dist/'
    ])
    let gitignorePath = path.join(dirPath, '.gitignore')
    let haveGitignore = false
    if (fs.existsSync(gitignorePath)) {
      haveGitignore = true
      ignoreRule.add(fs.readFileSync(gitignorePath).toString())
    }

    // Starting
    log('%-4s %-51s (%-5s, %-8s)', 'Type', 'Path or Name', 'Lines', 'Char.')
    let result = countLinesDir(dirPath, ignoreRule)

    let totalLines = result.lines
    let totalFolders = (function countTotalFolders (res) {
      let sum = 0
      for (let folder of res.folders) {
        sum += folder.folders.length + countTotalFolders(folder)
      }
      return sum
    })(result)
    let totalFiles = (function countTotalFiles (res) {
      let sum = res.files.length
      for (let folder of res.folders) {
        sum += countTotalFiles(folder)
      }
      return sum
    })(result)
    let totalCharacters = result.characters

    let extStateArray = (function (result) {
      let extState = (function countExtState (res, state) {
        for (let file of res.files) {
          if (state[file.ext]) {
            state[file.ext].lines += file.lines
            state[file.ext].filescount += 1
            state[file.ext].characters += file.characters
          } else {
            state[file.ext] = {
              name: file.ext.replace('.', ''),
              lines: file.lines,
              characters: file.characters,
              filescount: 1
            }
          }
        }
        for (let folder of res.folders) {
          countExtState(folder, state)
        }
        return state
      })(result, {})

      let extStateArray = []
      for (let ext in extState) {
        extStateArray.push(extState[ext])
      }
      extStateArray.sort((a, b) => {
        return a.lines < b.lines
      })
      return extStateArray
    })(result)

    // Result
    log('\n' + '-'.repeat(74))
    log('%-18s %s', 'Root Dir Path', dirPath.replace(/\\/g, '/'))
    log('%-18s %s', '', path.resolve(dirPath).replace(/\\/g, '/'))
    log('%-18s %s', 'Have .gitignore?', haveGitignore ? 'Yes' : 'No')
    log('%-18s \x1b[36m%s\x1b[0m', 'Total Lines', totalLines)
    log('%-18s \x1b[36m%s\x1b[0m', 'Total Folders', totalFolders)
    log('%-18s \x1b[36m%s\x1b[0m', 'Total Files', totalFiles)
    log('%-18s \x1b[36m%s\x1b[0m', 'Total Characters', totalCharacters)
    log('%-18s %-9s | %-6s | %-5s | %-4s | %-8s', 'File Type Ranking', 'Ext. Name', 'Per.', 'Lines', 'Files', 'Char.')
    for (let ext of extStateArray) {
      log('%-18s \x1b[33m%-9s\x1b[0m   %5.1f%%   %5d   %5d   %8s', '', ext.name, (ext.lines / totalLines * 100), ext.lines, ext.filescount, ext.characters)
    }
  }
}

main()
