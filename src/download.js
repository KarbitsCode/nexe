import { createGunzip as unZip } from 'zlib'
import { Extract as unTar } from 'tar'
import request from 'request'
import { Promise, promisify } from 'bluebird'
import { stat } from 'fs'
import rimraf from 'rimraf'

const statAsync = promisify(stat)
const rimrafAsync = promisify(rimraf)

function progress (req, log, precision = 10) {
  const logged = {}
  let length = 0
  let total = 1

  return req.on('response', (res) => {
    total = res.headers['content-length']
  }).on('data', (chunk) => {
    length += chunk.length
    const percentComplete = +(length / total * 100).toFixed()
    if (percentComplete % precision === 0 && !logged[percentComplete]) {
      logged[percentComplete] = true
      log(percentComplete)
    }
  })
}

function fetchNodeSource (path, url, log) {
  log.info('Downloading Node: ' + url)
  return new Promise((resolve, reject) => {
    progress(request.get(url), (pc) => {
      log.verbose(`Downloading Node: ${pc}%...`)
      if (pc === 100) {
        log.info('Extracting Node...')
      }
    }).on('error', reject)
      .pipe(unZip().on('error', reject))
      .pipe(unTar({ path, strip: 1 }))
      .on('error', reject)
      .on('end', () => resolve(log.info('Extracted to: ' + path)))
  })
}

function cleanSrc (clean, src, log) {
  if (clean === true) {
    log.info('Removing source: ' + src)
    return rimrafAsync(src).then(() => {
      log.info('Source deleted.' + src)
    })
  }
  return Promise.resolve()
}

/**
 * Deletes (maybe) and downloads the node source to the configured temporary directory
 * @param {*} compiler
 * @param {*} next
 */
export function download (compiler, next) {
  const { src, log } = compiler
  const { version, sourceUrl, clean } = compiler.options
  const url = sourceUrl || `https://nodejs.org/dist/v${version}/node-v${version}.tar.gz`

  return cleanSrc(clean, src, log).then(() => statAsync(src).then(
    x => !x.isDirectory() && fetchNodeSource(src, url, log),
    e => {
      if (e.code !== 'ENOENT') {
        throw e
      }
      return fetchNodeSource(src, url, log)
    }
  )).then(next)
}