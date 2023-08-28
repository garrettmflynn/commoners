import * as vite from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { VitePWA } from 'vite-plugin-pwa'

import { join } from 'node:path'

import { rootDir, userPkg, scopedOutDir, TARGET } from "../../globals.js";

export const resolveConfig = (commonersConfig = {}, { electron: withElectron, pwa, build} = {}) => {

    const sourcemap = !build    
    
    const config =  { ... commonersConfig }
    
    config.services = JSON.parse(process.env.COMMONERS_SERVICES) // Only provide sanitized service information

    // Only transfer plugin values that might actually be used
    if (config.plugins) config.plugins = config.plugins.map((v, i) => {
        const copy = {...v}
        if (('main' in copy)) {
            delete copy.main
            if (copy.electronOnly !== false) {
                delete copy.preload
                delete copy.render
            }
        }

        return copy
    })

    // NOTE: Only simple plugins can be transferred between contexts
    const strConfig = JSON.stringify(config, function (k, v) {
        if (typeof v === 'function') return v.toString().replaceAll('"', "'").replaceAll("\n", "\\n")
        else return v
    })

    const plugins = [
        {
            name: 'commoners',
            transformIndexHtml(html) {
return `<script>

    const pluginsResolved = new Promise(async (resolve, reject) => {


        const loaded = {}
        const __toRender = {}

        // Preload plugins for non-Electron builds
        if (!${withElectron}) {
            

            const { plugins } = globalThis.COMMONERS = JSON.parse(\`${strConfig}\`)
            if (plugins) {

                const pluginErrorMessage = (name, type, e) => console.error(\`[commoners] \${name} plugin (\${type}) failed to execute:\`, e)

                const getFnFromString = (str) => (0, eval)(\`(\${str})\`)

                // https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
                const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate)).then((results) => arr.filter((_v, index) => results[index]));


                const supported = await asyncFilter(plugins, async (plugin) => {
                    try {
                        let { isSupported } = plugin
                        if (isSupported && typeof isSupported === 'object') isSupported = isSupported['${TARGET}']
                        return (typeof isSupported === 'string') ? await getFnFromString(isSupported).call(plugin, '${TARGET}') : isSupported !== false
                    } catch {
                        return false
                    }
                })


                supported.forEach(({ name, preload }) => {
                    
                    loaded[name] = undefined // Register that all supported plugins are technically loaded

                    try {
                        if (preload) loaded[name] = getFnFromString(preload)()
                    } catch (e) {
                        pluginErrorMessage(name, "preload", e)
                    }

                })
            
                supported.forEach(({ name, render }) => {
                    if (render) __toRender[name] = getFnFromString(render)
                })
            }

            resolve(COMMONERS.plugins = { loaded, __toRender })

        } 
        
        else resolve(await COMMONERS.plugins) // Await the plugins declared in preload.js

    })

    document.addEventListener("DOMContentLoaded", async function(){

        await pluginsResolved
        const { plugins } = COMMONERS
        
        // Handle Preloaded Plugin Values
        const { __toRender = {}, loaded } = plugins
        delete plugins.__toRender
        const rendered = plugins.rendered = {}
        for (let name in __toRender) {
            try {
                rendered[name] = __toRender[name](loaded[name])
            } catch (e) {
                pluginErrorMessage(name, "render", e)
            }
        }
    });
</script>\n${html}`
            },
        },
    ]

    if (pwa && build) {

        const pwaOptions = { 
            registerType: 'autoUpdate',
            ...config.pwa 
        }

        // NOTE: On page reloads, this makes the service worker unable to find the index.html file...
        // if (!build) {
        //     const devOpts = ('devOptions' in pwaOptions) ? pwaOptions.devOptions : pwaOptions.devOptions = {}
        //     if (devOpts.enabled !== false) devOpts.enabled = true
        // }

        plugins.push(VitePWA(pwaOptions))
    }

    if (withElectron) {

        const electronPluginConfig = electron([
            {
                // Main-Process entry file of the Electron App.
                entry: join(rootDir, 'template/src/main/index.ts'),
                onstart: (options) => options.startup(),
                vite: {
                    logLevel: 'silent',
                    build: {
                        sourcemap,
                        minify: build,
                        outDir: join(scopedOutDir, 'main'),
                        rollupOptions: {
                            external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                        },
                    },
                },
            },
            {
                entry: join(rootDir, 'template/src/preload/index.ts'),
                onstart: (options) => options.reload(), // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, instead of restarting the entire Electron App.
                vite: {
                    logLevel: 'silent',
                    build: {
                        sourcemap: sourcemap ? 'inline' : undefined, // #332
                        minify: build,
                        outDir: join(scopedOutDir, 'preload'),
                        rollupOptions: {
                            external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                        },
                    },
                },
            }
        ])

        plugins.push(electronPluginConfig)
        plugins.push(renderer()) // Use Node.js API in the Renderer-process
    }

    return vite.mergeConfig(

        // Define a default set of plugins and configuration options
        vite.defineConfig({
            base: './',
            plugins,
            server: { open: !withElectron },
            clearScreen: false,
        }), 

        commonersConfig.vite ?? {} // Merge in the user configuration provided
    )
}