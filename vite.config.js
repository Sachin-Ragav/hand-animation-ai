import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const wasmFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

function copyMediaPipeWasm() {
  const copyFiles = () => {
    const source = resolve(
      'node_modules/@mediapipe/tasks-vision/wasm'
    )

    const destination = resolve('public/mediapipe-wasm')

    if (!existsSync(source)) {
      console.warn(
        'MediaPipe WASM folder was not found:',
        source
      )
      return
    }

    mkdirSync(destination, { recursive: true })

    for (const file of wasmFiles) {
      const sourceFile = resolve(source, file)
      const destinationFile = resolve(destination, file)

      if (existsSync(sourceFile)) {
        copyFileSync(sourceFile, destinationFile)
      }
    }

    console.log(
      'MediaPipe WASM files copied successfully.'
    )
  }

  return {
    name: 'copy-mediapipe-wasm',

    configureServer() {
      copyFiles()
    },

    buildStart() {
      copyFiles()
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    copyMediaPipeWasm(),
  ],

  assetsInclude: [
    '**/*.task',
  ],
})