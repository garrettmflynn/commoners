
import { afterAll, beforeAll, expect, describe, test } from 'vitest'
import {
    build,
    loadConfigFromFile,
    start,
    share,
    templateDir,
    globalTempDir,
    globalWorkspacePath,
    electronDebugPort,
    launch,
    UserConfig,
    LaunchOptions,
    CommonersGlobalObject,
  } from '../core/index'

import { join, sep, relative } from 'node:path'
import { rmSync, existsSync, readFileSync } from 'node:fs'
  
import * as puppeteer from 'puppeteer'
import { sleep } from '../core/tests/utils'

export const sharePort = 1234

type Output = {
  manager?: {
    close: Function
  }
}

const beforeStart = async (projectBase, customProps) => {
  const config = await loadConfigFromFile(projectBase)
  return await start({
  ...config,
  ...customProps
  })
}

const afterStart = (manager: Output['manager']) => {
  if (manager) manager.close({
    services: true,
    frontend: true
  })
}

const startProject = (projectBase, customProps = {}) => {

    const output: Output = {};
    beforeAll(async () => {
      output.manager = await beforeStart(projectBase, customProps)
    })

    afterAll(() => {
      afterStart(output.manager)
    })

    return output

  }


  const buildProject = async (projectBase, { target, outDir }, hooks = {}) => {

    const tempDir = join(projectBase, globalTempDir)
    const servicesDir = join(projectBase, globalWorkspacePath, 'services')
    const customBuildDir = join(projectBase, 'build')

    const toClear = [
      outDir,
      tempDir,
      servicesDir,
      customBuildDir
    ]

    const isElectron = target === 'electron'
    const isMobile = target === 'mobile'

  const waitTime = (isElectron || isMobile) ? 1 * 60 * 1000 : undefined // Wait a minute for Electron services to build

    beforeAll(async () => {

        // NOTE: Should the root be automatically updating the build.outDir property?
        const config = await loadConfigFromFile(projectBase)
        await build({
          ...config,
          target,
          build: {
            outDir: join(...relative(process.cwd(), projectBase).split(sep).map(() => '..'), outDir) // Escape to the project base
          }
        }, hooks)

      }, waitTime)
  
      afterAll(async () => {
        toClear.forEach(path => {
          if (existsSync(path)) rmSync(path, { recursive: true })
        })
      })
}  


type BrowserTestOutput = {
  info?: any
  page?: puppeteer.Page,
  browser?: puppeteer.Browser,
  commoners?: CommonersGlobalObject
}

export const startBrowserTest = (customProps: Partial<UserConfig> = {}, projectBase?: string) => {


  const output: BrowserTestOutput = {}

  const toLaunch = 'launch' in customProps

  const target = toLaunch ? customProps?.launch?.target : customProps.target

  const isElectron = target === 'electron'

  beforeAll(async () => {

      const result = output.info = await (toLaunch ? launch(customProps.launch as LaunchOptions) : beforeStart(projectBase, customProps))

      // if (toLaunch) await sleep(500) // Ensure server finishes opening

      const url = result.url

      // Launched Electron Instance
      if (isElectron) {

        await sleep(5 * 1000) // Wait for five seconds for Electron to open

        const browserURL = `http://localhost:${electronDebugPort}`
        const browser = output.browser = await puppeteer.launch({ headless: 'new' })
        const page = output.page = await browser.newPage();
        await page.goto(browserURL);
        const endpoint = await page.evaluate(() => fetch(`json/version`).then(res => res.json()).then(res => res.webSocketDebuggerUrl))
        await browser.close()
        delete output.browser
        delete output.page

        const browserWSEndpoint = endpoint.replace('localhost', '0.0.0.0')

        // Connect to WS
        output.browser = await puppeteer.connect({ browserWSEndpoint })
        const pages = await output.browser.pages()
        output.page = pages[0]

        output.commoners = await output.page.evaluate(() => commoners.ready.then(() => commoners))
        console.log(output.commoners)
      } 
      
      // Non-Electron Instance
      else {
          const browser = output.browser = await puppeteer.launch({ headless: 'new' })
          const page = output.page = await browser.newPage();
          await page.goto(url);
          output.page = page
          output.commoners = await output.page.evaluate(() => commoners.ready.then(() => commoners))


      }

  })

  afterAll(async () => {
    if (!toLaunch && isElectron && output.page) await output.page.evaluate(() => commoners.quit()).catch(e => {
      console.log(e)
    })
    if (output.browser) await output.browser.close()
    if (output.info.server) output.info.server.close()
    if (!toLaunch) afterStart(output.info)
  });

  return output

}

const shareProject = (projectBase, additionalProps = {}) => {

  const output: Output = {};
  beforeAll(async () => {
      const config = await loadConfigFromFile(projectBase)
      config.share = { port: sharePort, ...additionalProps } // Specify share port
      output.manager = await share(config)
  })

  afterAll(() => {
      if (output.manager) output.manager.close()
  })

  return output

}

  

export {
    startProject as start,
    buildProject as build,
    shareProject as share
}

const demoDir = 'demo'

export const checkAssets = (projectBase, baseDir = '', { build = false, target = 'web' } = {}) => {

  if (!baseDir) baseDir = join(projectBase, globalTempDir)

  //---------------------- Vite ----------------------
  describe('Vite assets', () => {
    
    expect(existsSync(join(baseDir, 'assets'))).toBe(build)

  })

  // ---------------------- Common ----------------------
  describe('Common assets', () => {

    expect(existsSync(join(baseDir, 'commoners.config.mjs'))).toBe(true)
    expect(existsSync(join(baseDir, 'commoners.config.cjs'))).toBe(true)
    expect(existsSync(join(baseDir, 'onload.mjs'))).toBe(true)
    expect(existsSync(join(baseDir, 'package.json'))).toBe(true) // Auto-generated package.json
    expect(existsSync(join(baseDir, templateDir, 'icon.png'))).toBe(true) // Template icon

  })

  // ---------------------- Electron ----------------------
  const isElectron = target === 'electron'
  describe('Electron assets', () => {
    expect(existsSync(join(baseDir, 'main.js'))).toBe(isElectron)
    expect(existsSync(join(baseDir, 'preload.js'))).toBe(isElectron)
    expect(existsSync(join(baseDir, demoDir, 'splash.html'))).toBe(isElectron)
    expect(existsSync(join(baseDir, '.env'))).toBe(isElectron)
  })


  // Service
  describe('Service assets', () => {

    expect(existsSync(join(baseDir, '..', '..', 'services', 'http', 'http'))).toBe(isElectron)
    expect(existsSync(join(baseDir, '..', '..', 'services', 'express', 'express'))).toBe(isElectron)

    // Custom with extra assets
    expect(existsSync(join(baseDir, '..', '..', '..', 'build', 'manual', 'manual'))).toBe(isElectron)
    
    const txtFile = join(baseDir, '..', '..', '..', 'build', 'manual', 'test.txt')
    expect(existsSync(txtFile)).toBe(isElectron)
    // expect(readFileSync(txtFile, 'utf-8')).toBe('Hello world!')

  })

  
  // ---------------------- PWA ----------------------
  describe('PWA assets', () => {

    const isPWA = target === 'pwa'
    expect(existsSync(join(baseDir, 'manifest.webmanifest'))).toBe(isPWA)
    expect(existsSync(join(baseDir, 'registerSW.js'))).toBe(isPWA)
    expect(existsSync(join(baseDir, 'sw.js'))).toBe(isPWA)
  })

}