import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { sourceHash } from './native-source.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'resources', 'bin')
mkdirSync(output, { recursive: true })

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (process.platform === 'darwin') {
  run('swiftc', [
    '-O',
    'native/macos/CaptionReader.swift',
    '-o',
    'resources/bin/caption-reader-macos'
  ])
  run('swiftc', [
    '-O',
    'native/macos/AudioReader/main.swift',
    'native/macos/AudioReader/Permission.swift',
    '-o',
    'resources/bin/audio-reader-macos',
    '-Xlinker',
    '-sectcreate',
    '-Xlinker',
    '__TEXT',
    '-Xlinker',
    '__info_plist',
    '-Xlinker',
    'native/macos/AudioReader/Info.plist'
  ])
  run('codesign', [
    '-s',
    '-',
    '-f',
    '-i',
    'io.useduet.audio-reader',
    'resources/bin/audio-reader-macos'
  ])
} else if (process.platform === 'win32') {
  // The hash of a reader's source, compiled into it (see native-source.mjs).
  const buildInfo = (source) => {
    const file = resolve(tmpdir(), `duet-${source.split('/').pop()}.BuildInfo.cs`)
    writeFileSync(
      file,
      `internal static class BuildInfo { public const string SourceHash = "${sourceHash(source)}"; }\n`
    )
    return file
  }
  const compilers = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
  ]
  const compiler = compilers.find(existsSync)
  if (!compiler) throw new Error('Windows C# compiler not found.')
  const framework = resolve(compiler, '..')
  const wpf = resolve(framework, 'WPF')
  run(compiler, [
    '/nologo',
    '/optimize+',
    '/target:exe',
    '/out:resources\\bin\\caption-reader-windows.exe',
    `/reference:${resolve(wpf, 'UIAutomationClient.dll')}`,
    `/reference:${resolve(wpf, 'UIAutomationTypes.dll')}`,
    `/reference:${resolve(wpf, 'WindowsBase.dll')}`,
    `/reference:${resolve(framework, 'System.Web.Extensions.dll')}`,
    'native\\windows\\CaptionReader.cs',
    buildInfo('native/windows/CaptionReader.cs')
  ])
  run(compiler, [
    '/nologo',
    '/optimize+',
    '/target:exe',
    '/out:resources\\bin\\audio-reader-windows.exe',
    `/reference:${resolve(framework, 'System.Web.Extensions.dll')}`,
    'native\\windows\\AudioReader.cs',
    buildInfo('native/windows/AudioReader.cs')
  ])
} else {
  console.log(`No native Duet readers are built for ${process.platform}.`)
}
